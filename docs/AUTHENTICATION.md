# Authentication and Verified Identity

## Provider and session model

SynqForge uses Auth.js v5 with GitHub OAuth as its initial identity provider and JWT sessions. The GitHub provider account ID is mapped to a stable UUIDv5 identity in the verified Auth.js JWT callback. The session callback validates that subject and exposes it as `session.user.id`.

This mapping is an identity adapter, not a replacement for OAuth verification. Only use the identity mapper with the provider ID delivered by Auth.js callbacks.

## Required server configuration

Set these values in the server environment; never commit real credentials:

- `AUTH_SECRET`: high-entropy Auth.js secret; required in production.
- `AUTH_GITHUB_ID`: GitHub OAuth application client ID.
- `AUTH_GITHUB_SECRET`: GitHub OAuth application secret.
- `AUTH_URL`: canonical application origin where required by the hosting environment.
- `DATABASE_URL`: PostgreSQL connection string for the restricted application runtime login only.

Register the OAuth callback URL as `https://YOUR_HOST/api/auth/callback/github`. For local development use `http://localhost:3000/api/auth/callback/github`.

Administrative credentials are for migrations and controlled maintenance only. They must not be exposed to application runtime code or configured as `DATABASE_URL`.

## Session-to-database boundary

The server-only `withCurrentUserTransaction` entry point calls Auth.js `auth()`, validates the session identity, obtains the restricted runtime pool, and invokes the transaction adapter. It accepts a database callback, not a caller-supplied user ID. The adapter sets RLS identity transaction-locally, commits or rolls back, and releases the client.

The application runtime login must not own application tables and must not have `BYPASSRLS`. It uses the restricted `synqforge_app` role through `SET LOCAL ROLE`.

## Implemented authenticated APIs

- `GET /api/workspaces` and `POST /api/workspaces`: list workspaces and atomically bootstrap a workspace with the verified creator as owner.
- `GET /api/projects?workspace_id=<uuid>` and `POST /api/projects`: list/create projects within an authorized workspace.
- `GET /api/projects/:projectId`: retrieve an authorized project and lifecycle data.
- `PATCH /api/projects/:projectId`: perform validated lifecycle transitions.
- `GET /api/projects/:projectId/artifacts` and `POST /api/projects/:projectId/artifacts`: list and append immutable artifact versions.
- `GET /api/projects/:projectId/generate-prd`: disclose configured provider/model to authenticated project members.
- `POST /api/projects/:projectId/generate-prd`: generate a PRD only after explicit consent and editor authorization.

The browser does not supply identity or role. PostgreSQL RLS remains authoritative for tenant isolation and write permissions. Viewers are read-only for project mutations and artifact generation.

## Live verification boundary

Automated CI exercises identity mapping, session-to-database boundaries, authorization logic, and PostgreSQL RLS using deterministic tests. The PostgreSQL runtime suite composes the same current-user transaction factory used by the server-only Auth.js adapter with a deterministic verified-session fixture, then verifies transaction-local identity and RLS against a real PostgreSQL service. This validates the adapter-to-database wiring, but it does not execute a real Auth.js cookie/JWT verification or prove that a deployed GitHub OAuth exchange succeeds. Deployed OAuth and authenticated browser verification remain separate release gates. Follow [the PRD generation verification runbook](PRD_GENERATION_VERIFICATION.md) in a non-production environment with synthetic data before treating the external integration as live-verified.

## Current limitations

- GitHub is the initial identity provider; account linking and additional providers require explicit design.
- Workspace invitations and membership/role administration are not exposed.
- Live OAuth, live provider, and deployed browser end-to-end verification remain outstanding.
