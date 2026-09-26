#!/usr/bin/env bash
# Runs the leaderboard SQL tests (MK-48) against the Postgres in PG* env vars (CI's `SQL` job).
# Locally: `PGHOST=… PGUSER=… scripts/test-sql.sh` on a throwaway database; it creates and drops
# its own `leaderboard_test` database.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
db=leaderboard_test
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $db" -c "create database $db"
run() { psql -q -v ON_ERROR_STOP=1 -o /dev/null -d "$db" "$@"; }
run -f supabase/tests/setup.sql
for pass in 1 2; do
  for file in supabase/migrations/*.sql; do
    echo "apply $file (pass $pass)"
    run -f "$file"
  done
done
for file in supabase/tests/*.test.sql; do
  echo "test $file"
  run -f "$file"
done
psql -q -c "drop database $db"
