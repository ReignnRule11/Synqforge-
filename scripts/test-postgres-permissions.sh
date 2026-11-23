#!/usr/bin/env bash
set -euo pipefail

: "${MIGRATION_DATABASE_URL:?MIGRATION_DATABASE_URL must point to a disposable PostgreSQL database}"

# Run twice to prove idempotency and checksum tracking before exercising RLS.
npm run db:migrate
npm run db:migrate
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/project_engine_permissions.sql
