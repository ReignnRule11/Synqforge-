#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to a disposable PostgreSQL database}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0001_project_engine.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0002_role_based_rls.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/0003_secure_workspace_bootstrap.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/tests/project_engine_permissions.sql
