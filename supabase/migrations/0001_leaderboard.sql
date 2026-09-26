-- Leaderboard (MK-48, ADR 0006): one board per track × engine class, one best row per device.
-- Everyone can read the boards; rows only change through submit_record(), which checks the
-- times against track_limits and rate-limits each device. Paste this whole file into the
-- Supabase SQL editor once (it is safe to re-run). See supabase/README.md.

-- The fastest a lap or race could possibly be on each track (`pnpm track-limits` prints the rows).
create table if not exists public.track_limits (
  track_id text primary key,
  laps smallint not null check (laps > 0),
  min_race_ms integer not null check (min_race_ms > 0),
  min_lap_ms integer not null check (min_lap_ms > 0)
);

create table if not exists public.records (
  id bigint generated always as identity primary key,
  track_id text not null references public.track_limits (track_id),
  engine_class smallint not null check (engine_class in (50, 100, 150)),
  nickname text not null check (nickname ~ '^[A-Za-z0-9 _-]{2,12}$'),
  -- The player's random device id (settings); private: it is what lets a device update its row.
  device_id uuid not null,
  race_ms integer not null check (race_ms > 0),
  best_lap_ms integer not null check (best_lap_ms > 0),
  -- When race_ms was set (ties on a board go to whoever got there first).
  created_at timestamptz not null default now(),
  unique (track_id, engine_class, device_id)
);

create index if not exists records_board on public.records (track_id, engine_class, race_ms, created_at);

-- Every submission a device made in the last hour: submit_record() allows 5 a minute.
create table if not exists public.record_submissions (
  device_id uuid not null,
  submitted_at timestamptz not null default now()
);

create index if not exists record_submissions_device on public.record_submissions (device_id, submitted_at);

-- Row Level Security: boards are public, and nothing is written directly. Device ids stay
-- private: anon and signed-in users may read every column but device_id.
alter table public.track_limits enable row level security;
alter table public.records enable row level security;
alter table public.record_submissions enable row level security;

drop policy if exists "track limits are public" on public.track_limits;
create policy "track limits are public" on public.track_limits for select using (true);
drop policy if exists "records are public" on public.records;
create policy "records are public" on public.records for select using (true);

revoke all on public.track_limits, public.records, public.record_submissions from anon, authenticated;
grant select on public.track_limits to anon, authenticated;
grant select (id, track_id, engine_class, nickname, race_ms, best_lap_ms, created_at)
  on public.records to anon, authenticated;

-- Submits a finished race. Returns {"status": "new" | "improved" | "kept" | "rejected",
-- "reason"?: text}: "kept" means the device's row was already faster (its nickname and best lap
-- still update). Rejections are returned, not raised, so the rate-limit log survives them.
create or replace function public.submit_record(
  p_track_id text,
  p_engine_class integer,
  p_nickname text,
  p_device_id uuid,
  p_laps integer,
  p_race_ms integer,
  p_best_lap_ms integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_per_minute constant integer := 5;
  -- Lap times add up to at most the race time (lap 1 starts at the line, after the grid);
  -- this much slack per lap covers rounding to whole milliseconds.
  rounding_ms_per_lap constant integer := 1;
  -- The best lap may not be quicker than this share of the average lap.
  min_lap_share constant numeric := 0.8;
  limits public.track_limits;
  existing public.records;
  recent integer;
begin
  if p_device_id is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'device');
  end if;
  -- One device at a time, so the rate limit counts concurrent calls too.
  perform pg_advisory_xact_lock(hashtext(p_device_id::text));
  delete from public.record_submissions where submitted_at < now() - interval '1 hour';
  select count(*) into recent from public.record_submissions
    where device_id = p_device_id and submitted_at > now() - interval '1 minute';
  if recent >= max_per_minute then
    return jsonb_build_object('status', 'rejected', 'reason', 'rate_limit');
  end if;
  insert into public.record_submissions (device_id) values (p_device_id);

  select * into limits from public.track_limits where track_id = p_track_id;
  if not found then
    return jsonb_build_object('status', 'rejected', 'reason', 'track');
  end if;
  if p_engine_class is null or p_engine_class not in (50, 100, 150) then
    return jsonb_build_object('status', 'rejected', 'reason', 'engine_class');
  end if;
  if p_nickname is null or p_nickname !~ '^[A-Za-z0-9 _-]{2,12}$' then
    return jsonb_build_object('status', 'rejected', 'reason', 'nickname');
  end if;
  if p_laps is distinct from limits.laps::integer then
    return jsonb_build_object('status', 'rejected', 'reason', 'laps');
  end if;
  if p_race_ms is null or p_best_lap_ms is null
    or p_race_ms < limits.min_race_ms or p_best_lap_ms < limits.min_lap_ms then
    return jsonb_build_object('status', 'rejected', 'reason', 'too_fast');
  end if;
  if p_best_lap_ms::bigint * p_laps > p_race_ms::bigint + rounding_ms_per_lap * p_laps
    or p_best_lap_ms < p_race_ms::numeric / p_laps * min_lap_share then
    return jsonb_build_object('status', 'rejected', 'reason', 'laps_dont_add_up');
  end if;

  select * into existing from public.records
    where track_id = p_track_id and engine_class = p_engine_class and device_id = p_device_id
    for update;
  if not found then
    insert into public.records (track_id, engine_class, nickname, device_id, race_ms, best_lap_ms)
      values (p_track_id, p_engine_class, p_nickname, p_device_id, p_race_ms, p_best_lap_ms);
    return jsonb_build_object('status', 'new');
  end if;
  if p_race_ms < existing.race_ms then
    update public.records set
      nickname = p_nickname,
      race_ms = p_race_ms,
      best_lap_ms = least(existing.best_lap_ms, p_best_lap_ms),
      created_at = now()
    where id = existing.id;
    return jsonb_build_object('status', 'improved');
  end if;
  update public.records set
    nickname = p_nickname,
    best_lap_ms = least(existing.best_lap_ms, p_best_lap_ms)
  where id = existing.id;
  return jsonb_build_object('status', 'kept');
end;
$$;

-- A board: the top 20 by race time, the caller's own row (wherever it ranks) and how many rows
-- there are. {"total": n, "top": [{"rank", "nickname", "race_ms", "best_lap_ms", "you"}],
-- "you": {…} | null}. Equal times share a rank.
create or replace function public.get_board(
  p_track_id text,
  p_engine_class integer,
  p_device_id uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select
      rank() over (order by race_ms) as rank,
      row_number() over (order by race_ms, created_at, id) as place,
      nickname,
      race_ms,
      best_lap_ms,
      coalesce(device_id = p_device_id, false) as you
    from public.records
    where track_id = p_track_id and engine_class = p_engine_class
  )
  select jsonb_build_object(
    'total', (select count(*) from ranked),
    'top', coalesce(
      (select jsonb_agg(to_jsonb(r) - 'place' order by r.place) from ranked r where r.place <= 20),
      '[]'::jsonb
    ),
    'you', (select to_jsonb(r) - 'place' from ranked r where r.you limit 1)
  );
$$;

revoke all on function public.submit_record(text, integer, text, uuid, integer, integer, integer) from public;
revoke all on function public.get_board(text, integer, uuid) from public;
grant execute on function public.submit_record(text, integer, text, uuid, integer, integer, integer)
  to anon, authenticated;
grant execute on function public.get_board(text, integer, uuid) to anon, authenticated;

-- Track limits (generated by `pnpm track-limits` from the track data; MK-48).
insert into public.track_limits (track_id, laps, min_race_ms, min_lap_ms) values
  ('sunny-circuit', 3, 80511, 26837),
  ('dune-canyon', 3, 75102, 25034),
  ('frostpeak-pass', 3, 69075, 23025),
  ('neon-harbour', 3, 71082, 23694),
  ('canopy-rush', 3, 66324, 22108),
  ('cog-works', 3, 69621, 23207)
on conflict (track_id) do update set
  laps = excluded.laps, min_race_ms = excluded.min_race_ms, min_lap_ms = excluded.min_lap_ms;
