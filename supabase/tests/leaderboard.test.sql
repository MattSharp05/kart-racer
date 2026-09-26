-- Leaderboard SQL tests (MK-48): run after setup.sql and the migrations, on a throwaway database
-- (`psql -v ON_ERROR_STOP=1 -f …`). Each block raises on a failed check. Calls go through the
-- anon role, as the game's do.

create or replace function pg_temp.expect(actual jsonb, expected jsonb, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', what, expected, actual;
  end if;
end;
$$;

-- Track limits every test below uses: 3 laps, race ≥ 60 s, lap ≥ 20 s.
insert into public.track_limits (track_id, laps, min_race_ms, min_lap_ms)
  values ('test-track', 3, 60000, 20000);

set role anon;

-- A plausible race is stored; one row per device per board.
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Ace', 'a0000000-0000-4000-8000-000000000001', 3, 90000, 29000),
  '{"status": "new"}', 'first record');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Ace 2', 'a0000000-0000-4000-8000-000000000001', 3, 95000, 28500),
  '{"status": "kept"}', 'slower race keeps the time, updates nickname and best lap');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Ace 3', 'a0000000-0000-4000-8000-000000000001', 3, 85000, 28000),
  '{"status": "improved"}', 'faster race');
select pg_temp.expect(
  public.submit_record('test-track', 100, 'Ace 3', 'a0000000-0000-4000-8000-000000000001', 3, 99000, 32000),
  '{"status": "new"}', 'another engine class is another board');
select pg_temp.expect(
  public.get_board('test-track', 150, 'a0000000-0000-4000-8000-000000000001'),
  '{"total": 1, "top": [{"rank": 1, "nickname": "Ace 3", "race_ms": 85000, "best_lap_ms": 28000, "you": true}],
    "you": {"rank": 1, "nickname": "Ace 3", "race_ms": 85000, "best_lap_ms": 28000, "you": true}}',
  'board after three submissions');

-- Impossible or malformed times are rejected (another device each, clear of the rate limit).
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000001', 3, 59999, 20000),
  '{"status": "rejected", "reason": "too_fast"}', 'race under the limit');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000002', 3, 90000, 19999),
  '{"status": "rejected", "reason": "too_fast"}', 'lap under the limit');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000003', 3, 90000, 23999),
  '{"status": "rejected", "reason": "laps_dont_add_up"}', 'best lap under 0.8 × the average lap');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000004', 3, 90000, 30002),
  '{"status": "rejected", "reason": "laps_dont_add_up"}', 'best lap slower than the average lap');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000005', 3, 90000, 30001),
  '{"status": "new"}', 'best lap equal to the average lap, within rounding');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000006', 2, 90000, 30000),
  '{"status": "rejected", "reason": "laps"}', 'wrong lap count');
select pg_temp.expect(
  public.submit_record('nowhere', 150, 'Cheat', 'b0000000-0000-4000-8000-000000000007', 3, 90000, 30000),
  '{"status": "rejected", "reason": "track"}', 'unknown track');
select pg_temp.expect(
  public.submit_record('test-track', 200, 'Cheat', 'b0000000-0000-4000-8000-000000000008', 3, 90000, 30000),
  '{"status": "rejected", "reason": "engine_class"}', 'unknown engine class');
select pg_temp.expect(
  public.submit_record('test-track', 150, '<script>', 'b0000000-0000-4000-8000-000000000009', 3, 90000, 30000),
  '{"status": "rejected", "reason": "nickname"}', 'nickname with bad characters');
select pg_temp.expect(
  public.submit_record('test-track', 150, 'Cheat', null, 3, 90000, 30000),
  '{"status": "rejected", "reason": "device"}', 'no device id');

-- Rate limit: 5 submissions a minute per device, rejected ones included.
select pg_temp.expect(
  public.submit_record('test-track', 50, 'Spam', 'c0000000-0000-4000-8000-000000000001', 3, 120000 - n, 39000),
  case when n <= 5 then case when n = 1 then '{"status": "new"}' else '{"status": "improved"}' end
       else '{"status": "rejected", "reason": "rate_limit"}' end::jsonb,
  'submission ' || n)
from generate_series(1, 7) as n;
select pg_temp.expect(
  public.submit_record('test-track', 50, 'Other', 'c0000000-0000-4000-8000-000000000002', 3, 110000, 36000),
  '{"status": "new"}', 'another device is not rate limited');

-- Ranks: equal times share a rank; the caller outside the top 20 still gets their row.
select public.submit_record('test-track', 50, 'Racer' || n, ('d0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  3, 100000 + n * 100, 33000)
from generate_series(1, 25) as n;
select public.submit_record('test-track', 50, 'Twin', 'e0000000-0000-4000-8000-000000000001', 3, 100100, 33000);
do $$
declare
  board jsonb := public.get_board('test-track', 50, 'd0000000-0000-4000-8000-000000000025');
begin
  if (board->>'total')::int <> 28 then raise exception 'FAIL total: %', board->'total'; end if;
  if jsonb_array_length(board->'top') <> 20 then raise exception 'FAIL top size: %', board->'top'; end if;
  if board->'top'->0->>'rank' <> '1' or board->'top'->1->>'rank' <> '1' then
    raise exception 'FAIL tied ranks: %', board->'top';
  end if;
  if board->'you'->>'nickname' <> 'Racer25' or board->'you'->>'rank' <> '26' then
    raise exception 'FAIL your row: %', board->'you';
  end if;
  if board::text like '%device%' then raise exception 'FAIL board leaks device ids'; end if;
end;
$$;
select pg_temp.expect(
  public.get_board('test-track', 150, null)->'you', 'null', 'no device: no row of yours');
select pg_temp.expect(
  public.get_board('nowhere', 150, null), '{"total": 0, "top": [], "you": null}', 'empty board');

-- Direct writes and device ids are off limits to the anon key.
do $$
begin
  begin
    insert into public.records (track_id, engine_class, nickname, device_id, race_ms, best_lap_ms)
      values ('test-track', 150, 'Direct', gen_random_uuid(), 1, 1);
    raise exception 'FAIL direct insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.records set race_ms = 1;
    raise exception 'FAIL direct update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform device_id from public.records;
    raise exception 'FAIL device ids are readable';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.record_submissions;
    raise exception 'FAIL submissions log is readable';
  exception when insufficient_privilege then null;
  end;
  perform nickname, race_ms from public.records;
end;
$$;

reset role;
\echo 'leaderboard SQL tests passed'
