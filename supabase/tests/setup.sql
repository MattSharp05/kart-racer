-- Stand-ins for the roles a Supabase project already has, so the migration runs on a plain
-- Postgres (CI's `SQL (leaderboard)` job; `supabase/README.md` → Testing).
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;
grant usage on schema public to anon, authenticated;
