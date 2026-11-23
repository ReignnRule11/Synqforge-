# Project Artifacts API

Project artifacts are immutable, versioned documents attached to a project and workspace.

## Endpoints

- `GET /api/projects/:projectId/artifacts` — list artifact versions visible to the authenticated workspace member. Optional `artifact_type` filters the history.
- `POST /api/projects/:projectId/artifacts` — append a new version. Requires JSON with `artifact_type`, `title`, and object-valued `content`.

Supported types: `product_brief`, `prd`, `user_stories`, `roadmap`, `design_spec`, `architecture`, `api_contract`, `database_schema`, `source_code`, and `test_report`.

## Versioning and authorization

- Creator identity is derived from the verified Auth.js transaction context; the client cannot set `created_by`.
- Workspace membership and editor permissions are enforced by PostgreSQL RLS.
- Viewers can list versions but cannot append them.
- Versions cannot be updated or deleted through the runtime role. Corrections append a new version.
- Version allocation takes a transaction-scoped PostgreSQL advisory lock keyed by project and artifact type, then allocates `MAX(version) + 1`.
- A successful append also writes a project activity event in the same transaction. If either write fails, both roll back.
- Each artifact payload must be a JSON object no larger than 64 KiB; titles are 2–160 characters.

## Operational notes

The API does not generate documents with an AI provider. It persists structured content supplied by the authenticated editor. Provider-backed generation, richer schema validation per artifact type, and browser-level end-to-end tests remain future work.
