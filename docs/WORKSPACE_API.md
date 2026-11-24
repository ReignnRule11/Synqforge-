# Authenticated Workspace API

## Authentication and database boundary

Each handler uses the server-only `withCurrentUserTransaction` boundary, which resolves the Auth.js session and derives database identity from its verified UUID subject. It accepts no caller-supplied user ID. Unauthenticated requests receive JSON `401` responses.

Queries run as the restricted `synqforge_app` role with transaction-local identity. PostgreSQL RLS remains authoritative for workspace and membership visibility.

## Endpoints

### `GET /api/workspaces`

Returns the current user's workspaces with `id`, `name`, `slug`, `role`, and `created_at`. Membership and RLS scope results to the authenticated user.

### `POST /api/workspaces`

Accepts JSON `{ "name": "Workspace name" }`. The server validates the name and derives a URL-safe slug. It calls `public.create_workspace(name, slug)`, which obtains identity from transaction-local `app.user_id` and atomically inserts the workspace and its owner membership. The client cannot choose an owner or membership role.

Responses include `201` created, `400` malformed JSON, `401` unauthenticated, `409` slug collision, `415` unsupported content type, `422` invalid name, and `500` unexpected server/database failure.

## Security boundaries and exclusions

- No workspace membership mutation, invitation, or role-change endpoint is exposed.
- Project APIs are implemented separately; see [PROJECT_API.md](PROJECT_API.md).
- Workspace creation assigns the verified creator the `owner` role atomically.
- The client cannot choose identity or elevate a role.
- Automated tests do not replace live OAuth/browser verification.
