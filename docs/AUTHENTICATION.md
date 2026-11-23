# Authentication and Verified Identity

## Provider and session model

SynqForge uses Auth.js with GitHub OAuth as its initial identity provider. The application uses encrypted/signed Auth.js JWT sessions; it does not accept user IDs from request bodies, query parameters, browser storage, or client-side state.

The OAuth provider account ID is available to the JWT callback only after Auth.js completes the provider flow. SynqForge maps that verified numeric GitHub account ID to a stable UUIDv5 identity using a fixed namespace and the `github:` provider prefix. The UUID is stored as the Auth.js token subject and exposed through the server-verified session as `session.user.id`. The deterministic mapping means the same GitHub account receives the same database identity after a new sign-in.

This mapping is an identity adapter, not a replacement for OAuth verification. Only use `githubUserIdToUuid` with the provider ID delivered by Auth.js callbacks.

## Required server configuration

Set these values in the server environment; never commit real credentials:

- `AUTH_SECRET`: high-entropy Auth.js secret.
- `GITHUB_CLIENT_ID`: GitHub OAuth application client ID.
- `GITHUB_CLIENT_SECRET`: GitHub OAuth application secret.
- `AUTH_URL`: canonical application origin where required by the hosting environment.

Register the OAuth callback URL as `https://YOUR_HOST/api/auth/callback/github`. For local development use `http://localhost:3000/api/auth/callback/github`.

The middleware protects application routes and sends unauthenticated visitors to `/signin`. Auth.js endpoints remain reachable so the OAuth flow can complete. The sign-in page uses a server action and does not accept an arbitrary callback URL.

## Database integration gate

The session UUID is compatible with the existing PostgreSQL UUID identity context. A future server-only data access layer must:

1. Call `auth()` and reject requests without a verified session and UUID.
2. Pass only `session.user.id` to `withAuthenticatedUserTransaction`.
3. Keep `DATABASE_URL` and all database credentials server-side.
4. Use the restricted runtime login and transaction-local RLS identity.
5. Enforce workspace role authorization in every handler.

Do not create workspace/project API routes until the auth/session tests and the database-backed API authorization tests exist.

## Current limitations

- GitHub is the first provider; additional providers require explicit identity namespace and account-linking design.
- No user profile table or provider-account linking table is introduced in this milestone.
- No workspace/project APIs are exposed yet.
- OAuth cannot complete until deployment/local environment secrets and the GitHub callback URL are configured.
- No production deployment or live OAuth verification is claimed by this change.
