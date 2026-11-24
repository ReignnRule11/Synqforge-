# Project Artifacts API

Project artifacts are immutable, versioned documents attached to a project and workspace.

## Endpoints

- `GET /api/projects/:projectId/artifacts` — list artifact versions visible to an authenticated workspace member. Optional `artifact_type` filters history.
- `POST /api/projects/:projectId/artifacts` — append a version. Requires JSON with `artifact_type`, `title`, and object-valued `content`, plus an `Idempotency-Key` request header.
- `GET /api/projects/:projectId/generate-prd` — disclose configured provider/model to an authenticated project member before consent.
- `POST /api/projects/:projectId/generate-prd` — generate and persist a PRD after explicit consent and editor authorization.

Supported artifact types: `product_brief`, `prd`, `user_stories`, `roadmap`, `design_spec`, `architecture`, `api_contract`, `database_schema`, `source_code`, and `test_report`.

## Idempotency contract

- Every artifact-create POST must provide `Idempotency-Key` with 8–128 ASCII letters, digits, dots, underscores, colons, or hyphens.
- The key is scoped to the authenticated workspace, project, and `artifact.create` operation. A key used for another workspace or project does not collide.
- The server hashes a canonical representation of artifact type, normalized title, and content. Object key order does not change the hash.
- First successful use creates the immutable artifact, activity event, and idempotency record in one PostgreSQL transaction; the response is `201` with `idempotent_replay: false`.
- A retry with the same key and same payload returns the original artifact with `200` and `idempotent_replay: true`. It does not allocate another version or append another activity event.
- Reusing a key with a different payload returns `409`. The original record remains unchanged.
- A failed transaction persists neither the artifact nor its activity/idempotency records, so the same key can safely be retried.
- A transaction-scoped advisory lock serializes requests using the same scoped key. A separate project/type lock continues to serialize version allocation.
- The dashboard retains the key after a failed request and clears it only after a successful response, so a user retry reuses the same key.

## Versioning and authorization

- Creator identity is derived from the verified Auth.js transaction context; the client cannot set `created_by`.
- Workspace membership and editor permissions are enforced by PostgreSQL RLS.
- Viewers can list versions but cannot append or generate artifacts.
- Versions cannot be updated or deleted through the runtime role. Corrections append a new version.
- Version allocation uses a transaction-scoped PostgreSQL advisory lock keyed by project and artifact type.
- Artifact and activity writes occur in the same transaction; if either write fails, both roll back.
- Artifact payloads must be JSON objects no larger than 64 KiB; titles are 2–160 characters.

## Consent-gated PRD generation

The POST route accepts only `{ "consent": true }`. It loads the project brief from the database after verifying the session and editor role; clients cannot supply project content, identity, or role. The selected provider receives the project name, description, target, and brief. Output is schema-validated and checked against artifact limits. Membership is checked again before the immutable PRD version and activity event are appended atomically.

Provider errors, malformed output, and oversized output fail closed and do not persist an artifact. The generated PRD is a first draft requiring human review. See [AI_GATEWAY.md](AI_GATEWAY.md) and [PRD_GENERATION_VERIFICATION.md](PRD_GENERATION_VERIFICATION.md).

## Verification

Deterministic route and artifact tests run in CI. Live OAuth/provider connectivity and deployed browser workflows remain manual environment-level checks.
