#!/usr/bin/env bash
# Run migrations + RLS tests against a throwaway database on plain Postgres.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres tests/integration/rls/run.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/../../.." && pwd)"
DB="diagram_studio_rls_test"
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB" postgres
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/supabase-stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/rls.test.sql"
psql -q -c "drop database $DB" postgres
