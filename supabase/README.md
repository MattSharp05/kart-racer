# Supabase

The online side of v2 (ADR 0006): Realtime for rooms (no tables, see `src/net/roomBackendSupabase.ts`) and Postgres for the leaderboard (MK-48). The project URL and anon key are in `.env.example` and Vercel (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). They are public by design; Row Level Security protects the data. **Never commit a `service_role` or secret key.**

## Applying the SQL

Nobody but the project owner can run SQL on the project, and there is no CLI link. To apply a migration:

1. Open the project in the Supabase dashboard → **SQL Editor** → **New query**.
2. Paste the whole file (e.g. `migrations/0001_leaderboard.sql`) and press **Run**. It should say "Success. No rows returned".
3. Check: `curl -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/get_board" -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"p_track_id":"sunny-circuit","p_engine_class":150}'` returns `{"total": 0, "top": [], "you": null}` (not a `PGRST202` error).

Every migration is safe to run again. Until it is applied the game carries on as normal: races end as usual and nothing is submitted (the client stops asking for the rest of the page load after the server's first "function not found").

## The leaderboard (`migrations/0001_leaderboard.sql`)

- `records`: one row per device × board (track × engine class): nickname, `race_ms`, `best_lap_ms`. Anyone can read every column except `device_id`; nobody writes to it directly.
- `track_limits(track_id, laps, min_race_ms, min_lap_ms)`: the fastest a race or lap could possibly be on each track, and the lap count a board is for.
- `submit_record(track_id, engine_class, nickname, device_id, laps, race_ms, best_lap_ms)` (security definer) is the only way in. It rejects: an unknown track or engine class, a bad nickname, the wrong lap count, times under the track's limits, a best lap slower than the average lap (lap times add up to at most the race time) or quicker than 0.8 × the average lap, and more than 5 submissions a minute from one device (rejected ones count). A faster race replaces the device's row; a slower one only updates the nickname and best lap. It returns `{"status": "new" | "improved" | "kept" | "rejected", "reason"?}`.
- `get_board(track_id, engine_class, device_id)` returns `{"total", "top": [20 fastest], "you": your row or null}`; each row is `{rank, nickname, race_ms, best_lap_ms, you}` and equal times share a rank.
- The game side is `src/records/leaderboard.ts`: after a race started from the menus or a room (never on a page opened from a scenario link), a finish that improves this device's row (race time or best lap) is submitted with the profile's nickname and device id. One that can't reach the server is kept (`localStorage`, per board) and sent with the next finish on that board.
- Keep-alive: `.github/workflows/supabase-keepalive.yml` calls `get_board` every Monday so the free project doesn't pause. Run it by hand from the Actions tab (**Supabase keep-alive** → Run workflow).

## Adding a track (or making karts faster)

1. `pnpm track-limits` prints an `insert … on conflict do update` for every race track, from the track data: the shortest line round the lap (road and verges, plus any shorter route) at the fastest racer's boosted 150cc top speed, × 0.9 (`src/records/trackLimits.ts`).
2. Put its output in a new migration, `migrations/000N_track_limits_<what>.sql` (the older files stay as they are), and apply it as above.
3. `src/records/trackLimits.test.ts` fails until the migrations have a row for every race track, and whenever a stored limit is stricter than today's data allows (e.g. after a speed buff).

## Testing

`pnpm test:sql` (CI's **SQL (leaderboard)** job) applies every migration twice to a throwaway database on the Postgres in the `PG*` environment variables, then runs `tests/*.test.sql`. `tests/setup.sql` creates the `anon` and `authenticated` roles a Supabase project already has. Locally, with a Postgres you can create databases on: `PGHOST=localhost PGUSER=postgres pnpm test:sql`.
