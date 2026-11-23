# PostgreSQL Migrations and Operations

## Connection roles

SynqForge uses separate credentials for application traffic and schema changes.

| Variable | Purpose | Runtime exposure |
| --- | --- | --- |
| `DATABASE_URL` | Restricted application login; granted membership in `synqforge_app` and used only through `SET LOCAL ROLE synqforge_app` | Server runtime only |
| `MIGRATION_DATABASE_URL` | DDL-capable migration identity; owns or can create application schema objects and can create the non-login `synqforge_app` role | Explicit migration/release job only |
| `ADMIN_DATABASE_URL` | Disposable CI fixture provisioning and test cleanup | CI test job only; never production app configuration |

Do not point `DATABASE_URL` at a database owner, superuser, or migration credential. Do not expose any database URL to browser/mobile code.

## Applying migrations

The runner is explicit; it does not execute during Next.js startup.

```bash
MIGRATION_DATABASE_URL='postgresql://…' npm run db:migrate
```

The runner:

1. Requires `MIGRATION_DATABASE_URL`; it never reads `DATABASE_URL`.
2. Acquires a PostgreSQL session advisory lock so two deploy jobs cannot apply migrations concurrently.
3. Creates `public.schema_migrations` if absent.
4. Applies sorted `NNNN_description.sql` files in individual transactions and records a SHA-256 checksum in the same transaction.
5. Skips already-applied files only when their checksum matches.
6. Stops on checksum drift or when the database records a migration missing from the checkout. Applied migration files are immutable; make a new forward migration instead.

A failed migration is rolled back and is not marked as applied. The runner is safe to invoke again after a successful run. It intentionally has no automatic destructive down-migration.

## Provisioning a production database

1. Create a PostgreSQL database and a dedicated migration identity. The migration identity must be able to create schema objects, install the required extension, and create the restricted `synqforge_app` role. Keep its credential in the deployment platform's secret store.
2. Run `npm run db:migrate` once as a controlled release step using `MIGRATION_DATABASE_URL`.
3. Provision a separate login for the application. Example SQL (replace the role name and password using your secret-management process):

```sql
CREATE ROLE synqforge_runtime
  LOGIN PASSWORD 'REPLACE_WITH_A_SECRET'
  NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE synqforge TO synqforge_runtime;
GRANT synqforge_app TO synqforge_runtime;
```

The application transaction adapter uses `SET LOCAL ROLE synqforge_app`; the login must not own application tables and must not have `BYPASSRLS`. Configure this login as `DATABASE_URL`. The app role is non-login and the runtime login cannot directly administer workspace memberships.

4. Require TLS for remote database connections (for example, a provider-supported `sslmode=require` connection string), restrict network access to the application and release runner, and use a managed backup/PITR policy.
5. Deploy the application only after the migration job succeeds. Do not run migrations automatically in every web instance.

## Operational checks

- Confirm `DATABASE_URL` and `MIGRATION_DATABASE_URL` use different database identities.
- Confirm the runtime login is not a superuser, table owner, role creator, database creator, or RLS-bypass role.
- Confirm the migration history is current and checksums match the repository.
- Back up before production schema changes; test restore procedures independently.
- Prefer additive/expand-and-contract schema changes for rolling deployments.
- Rotate credentials through the hosting secret manager. Never log connection strings.
- CI runs the migration runner twice against a clean PostgreSQL 16 service, then executes the RLS/bootstrap SQL suite and the dedicated least-privilege runtime integration tests.

## Current limitations

- This repository provides a migration runner and operational guidance, not a hosted database or production credentials.
- Production provisioning, TLS/network policy, backup/PITR, and live deployment execution remain environment-specific operator responsibilities.
- Migrations are forward-only. Recovery from a bad production migration requires a reviewed corrective migration or a database restore.
