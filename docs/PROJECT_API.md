# Authenticated Project API

Projects are scoped to a workspace. A workspace identifier is an untrusted resource selector, not an identity or authorization claim.

## Endpoints

- `GET /api/projects?workspace_id=<uuid>` — list projects visible to the authenticated user in the selected workspace.
- `POST /api/projects` — create a project in an authorized workspace.
- `GET /api/projects/:projectId` — retrieve an authorized project and its lifecycle state.
- `PATCH /api/projects/:projectId` — request a validated lifecycle transition.

Project creation accepts `workspace_id`, `name`, optional `description`, and target (`web`, `mobile`, or `web_mobile`). Status and creator identity are assigned by trusted server/database logic, not by the client.

## Security boundary

- Routes call `withCurrentUserTransaction`; user identity comes only from the verified Auth.js server session.
- `created_by` is derived from transaction-local `app.user_id`, never request JSON.
- Workspace membership and editor permissions are enforced by PostgreSQL RLS.
- Owners, admins, and members can perform permitted writes; viewers are read-only.
- A foreign workspace UUID cannot grant access.
- Lifecycle transitions are validated server-side and recorded in the append-only activity ledger.
- Membership administration, invitations, and project deletion are not exposed.

## Verification

CI runs project-domain tests, authenticated route tests, and PostgreSQL RLS/least-privilege tests. These do not constitute a live browser/OAuth smoke test.
