# Authentication and Verified Identity

## Provider and session model

SynqForge uses Auth.js with GitHub OAuth as its initial identity provider. The application uses Auth.js JWT sessions; database identity is never accepted from request bodies, query parameters, browser storage, or client-side state.

The OAuth provider account ID is available to the JWT callback only after Auth.js completes the provider flow. SynqForge maps that verified numeric GitHub account ID to a stable UUIDv5 identity using a fixed namespace and the `github:` provider prefix. The UUID is stored as the Auth.js token subject and exposed through the server-verified session as `session.user.id`.

This mapping is an identity adapter, not a replacement for OAuth verification. Only use `githubUserIdToUuid` with the provider ID delivered by Auth.js callbacks.

## Required server configuration

Set these values in the server environment; never commit real credentials:

- `AUTH_SECRET`: high-entropy Auth.js secret. It must be configured in production.
- `AUTH_GITHUB_ID`: GitHub OAuth application client ID.
- `AUTH_GITHUB_SECRET`: GitHub OAuth application secret.
- `AUTH_URL`: canonical application origin where required by the hosting environment.
- `DATABASE_URL`: PostgreSQL connection string for the restricted `synqforge_app` runtime login only.

Register the OAuth callback URL as `https://YOUR_HOST/api/auth/callback/github`. For local development use `http://localhost:3000/api/auth/callback/github`.

Administrative credentials are for migrations and controlled maintenance only. They must not be exposed to application runtime code or configured as `DATABASE_URL`.

## Session identity enforcement

The Auth.js session callback fails closed if the JWT subject is absent or is not a UUIDv5 identity. The server-only `withCurrentUserTransaction` entry point calls `auth()`, validates the session identity, obtains the restricted runtime pool, and then invokes the existing transaction adapter. Its public signature accepts only a database callback; it has no user-ID, request-body, query-string, or client identity argument.

The runtime pool is isolated in a `server-only` module, lazily initialized from `DATABASE_URL`, and uses bounded connection settings. The transaction adapter sets the RLS identity transaction-locally and releases the client after commit or rollback.

## API and authorization gate

No workspace or project API routes are introduced in this milestone. Before exposing them:

1. Each server handler must use `withCurrentUserTransaction`; it must not call the lower-level transaction adapter with a caller-supplied identity.
2. Workspace role authorization must be enforced for every operation, in addition to PostgreSQL RLS.
3. API routes must return explicit JSON 401/403 responses rather than relying on page middleware redirects.
4. PostgreSQL integration tests must cover unauthenticated access, forged client identity, cross-tenant reads/writes, and owner/admin/member/viewer permissions.
5. Live OAuth and the authenticated API path must be exercised in a configured environment.

## Current limitations

- GitHub is the first provider; additional providers require explicit identity namespace and account-linking design.
- No user profile table or provider-account linking table is introduced in this milestone.
- No workspace/project APIs are exposed yet.
- OAuth cannot complete until environment secrets and the GitHub callback URL are configured.
- CI validates the session-to-database boundary with deterministic tests; it does not prove a live OAuth exchange or production deployment.
