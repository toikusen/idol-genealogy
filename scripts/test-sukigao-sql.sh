#!/usr/bin/env bash
# Runs migrations 106–115 (顏控9選) + their SQL tests against a throwaway local
# Postgres. Needs initdb / pg_ctl / psql (e.g. apt install postgresql-16);
# does not touch Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PORT:-54329}"
TMP="$(mktemp -d)"
chmod 777 "$TMP"

# initdb refuses to run as root; drop to the postgres user when needed.
as_pg() {
  if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi
}

cleanup() {
  as_pg "'$PG_BIN/pg_ctl' -D '$TMP/data' -m immediate stop" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

as_pg "'$PG_BIN/initdb' -D '$TMP/data' -A trust -U postgres" >/dev/null
as_pg "'$PG_BIN/pg_ctl' -D '$TMP/data' -o '-p $PORT -k $TMP' -l '$TMP/log' -w start" >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$TMP" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/sukigao_local_bootstrap.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/106_sukigao.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/107_sukigao_all_members.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/108_sukigao_is_current.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/109_sukigao_load_hardening.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/110_sukigao_raise_ip_cap.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/111_sukigao_submit_hardening.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/113_sukigao_stats.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/114_sukigao_user_results.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/115_sukigao_plays.sql"
"${PSQL[@]}" -o /dev/null -f "$ROOT/supabase/tests/106_sukigao.test.sql"
