# Authenticated Project API

Projects are scoped to a workspace. The workspace identifier is an untrusted resource selector, not an identity or authorization claim.

## Endpoints

### `GET /api/projects?workspace_id=<uuid>`

Returns projects visible to the current authenticated user in the selected workspace. A valid workspace UUID that belongs to another tenant returns an empty list under PostgreSQL row-level security.

### `POST /api/projects`

Accepts JSON:

```json
{
  "workspace_id": "workspace UUID",
  "name": "Product name",
  "description": "Optional product description",
  "target": "web"
}
```

Supported targets: `web`, `mobile`, `web_mobile`. Project status is initialized by the database to `idea`; callers cannot assign creator identity or status.

## Security boundary

- The route calls `withCurrentUserTransaction`; the user UUID comes only from the verified Auth.js server session.
- The restricted PostgreSQL runtime role sets transaction-local `app.user_id`.
- `created_by` is derived inside SQL from that transaction context, never from request JSON.
- Workspace membership and editor permissions are enforced by PostgreSQL RLS. Owners, admins, and members may create; viewers are read-only.
- A foreign workspace UUID cannot grant access. RLS blocks inserts and filters reads even when a caller supplies a valid UUID.
- The route does not expose project update/delete, membership administration, invitations, or project lifecycle transitions.

## Verification

- `npm run test:project-domain` validates input normalization, bounds, and target allowlisting.
- `npm run test:postgres-runtime` exercises owner/member creation, viewer denial, creator identity binding, and cross-tenant read/write isolation using the non-owner runtime login.
- CI also runs typecheck, lint, build, and the PostgreSQL RLS workflow.
