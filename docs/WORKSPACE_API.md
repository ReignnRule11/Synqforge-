# Authenticated Workspace API

## Authentication and database boundary

The workspace API is intentionally excluded from page middleware redirects. Each handler uses the server-only `withCurrentUserTransaction` boundary, which resolves the Auth.js session and derives the database identity from its verified UUID subject. It accepts no caller-supplied user ID. Unauthenticated requests receive JSON `401` responses.

All queries run as the restricted `synqforge_app` role with transaction-local identity. PostgreSQL RLS remains authoritative for workspace and membership visibility.

## Endpoints

### `GET /api/workspaces`

Returns the current user's workspaces with `id`, `name`, `slug`, `role`, and `created_at`. The query joins memberships; RLS limits the result to the authenticated user's memberships. Roles are returned as data and are not elevated by the API.

### `POST /api/workspaces`

Accepts JSON `{ "name": "Workspace name" }`. The server trims and validates the name and derives a URL-safe slug. It calls `public.create_workspace(name, slug)`, which obtains identity from transaction-local `app.user_id` and atomically inserts the workspace and its owner membership. The client cannot choose an owner or membership role.

Responses: `201` created, `400` malformed JSON, `401` unauthenticated, `409` slug collision, `415` unsupported content type, `422` invalid name, and `500` unexpected server/database failure. Error responses do not expose SQL or credential details.

## Security boundaries and exclusions

- No workspace membership mutation endpoint is exposed. Invitations and role changes require a separately reviewed trusted flow.
- No project creation or project mutation endpoint is exposed in this milestone.
- Workspace creation always assigns the authenticated creator the `owner` role in the same database transaction.
- Workspace listing does not accept user IDs, workspace IDs, or role filters from the client.
- CI and PostgreSQL integration tests do not replace a live OAuth/browser smoke test with configured GitHub OAuth and restricted database credentials.
