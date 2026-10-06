#!/usr/bin/env bash
# Applies all migrations + seed to a throwaway PostgreSQL 16 cluster (with
# pgvector) using stubbed Supabase schemas, then runs the RLS test suite.
# Usage: scripts/test-db.sh            (needs initdb/pg_ctl on PATH or in /usr/lib/postgresql/16/bin)
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
DATA="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DATA"; RUN_AS="sudo -u postgres"; fi
$RUN_AS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
trap '$RUN_AS "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null; rm -rf "$DATA"' EXIT
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database app" postgres
$PSQL -d app -c "create extension if not exists pgcrypto; create schema if not exists extensions;"
$PSQL -d app -f supabase/tests/supabase_stubs.sql
for f in supabase/migrations/*.sql; do echo "applying $f"; $PSQL -d app -f "$f"; done
$PSQL -d app -f supabase/seed.sql
$PSQL -d app -f supabase/tests/rls.test.sql
if [ "${KEEP_DB:-}" = "1" ]; then echo "DB kept on port $PORT (Ctrl+C to stop)"; trap - EXIT; fi
