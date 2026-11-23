import { NextResponse } from "next/server";
import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { PROJECT_ARTIFACT_TYPES, validateProjectArtifactInput } from "@/lib/projects/artifacts";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function statusFor(error: unknown): number {
  if (!error || typeof error !== "object") return 500;
  const code = (error as { code?: unknown }).code;
  if (code === "42501") return 403;
  if (code === "22P02" || code === "22023") return 422;
  if (error instanceof Error && error.message === "A verified session UUID is required.") return 401;
  return 500;
}

type RouteContext = { params: Promise<{ projectId: string }> };

/** List immutable artifact versions visible to the authenticated workspace member. */
export async function GET(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) return errorResponse("A valid project ID is required.", 422);
  const artifactType = new URL(request.url).searchParams.get("artifact_type");
  if (artifactType && !(PROJECT_ARTIFACT_TYPES as readonly string[]).includes(artifactType)) {
    return errorResponse("Unsupported artifact_type.", 422);
  }

  try {
    const artifacts = await withCurrentUserTransaction(async (client) => {
      const project = await client.query("SELECT id FROM projects WHERE id = $1", [projectId]);
      if (!project.rows[0]) return null;
      const result = await client.query(
        `SELECT id, workspace_id, project_id, artifact_type, title, version,
                content, created_by, created_at
         FROM project_artifacts
         WHERE project_id = $1 AND ($2::text IS NULL OR artifact_type = $2)
         ORDER BY artifact_type ASC, version DESC`,
        [projectId, artifactType],
      );
      return result.rows;
    });
    if (!artifacts) return errorResponse("Project not found.", 404);
    return NextResponse.json({ artifacts });
  } catch (error) {
    const status = statusFor(error);
    return errorResponse(status === 401 ? "Authentication required." : "Unable to list project artifacts.", status);
  }
}

/** Append a new immutable version. The advisory lock serializes version allocation per type/project. */
export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) return errorResponse("A valid project ID is required.", 422);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return errorResponse("Content-Type must be application/json.", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  let input: ReturnType<typeof validateProjectArtifactInput>;
  try {
    input = validateProjectArtifactInput(body);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Artifact details are invalid.", 422);
  }

  try {
    const artifact = await withCurrentUserTransaction(async (client) => {
      const projectResult = await client.query(
        "SELECT workspace_id FROM projects WHERE id = $1",
        [projectId],
      );
      const project = projectResult.rows[0] as { workspace_id: string } | undefined;
      if (!project) return null;

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${projectId}:${input.artifactType}`],
      );
      const versionResult = await client.query(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM project_artifacts WHERE project_id = $1 AND artifact_type = $2",
        [projectId, input.artifactType],
      );
      const version = Number(versionResult.rows[0].next_version);
      const inserted = await client.query(
        `INSERT INTO project_artifacts
           (workspace_id, project_id, artifact_type, title, version, content, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, current_setting('app.user_id')::uuid)
         RETURNING id, workspace_id, project_id, artifact_type, title, version,
                   content, created_by, created_at`,
        [project.workspace_id, projectId, input.artifactType, input.title, version, JSON.stringify(input.content)],
      );
      await client.query(
        `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary, metadata)
         VALUES ($1, $2, current_setting('app.user_id')::uuid, 'artifact.version_created', $3, $4::jsonb)`,
        [
          project.workspace_id,
          projectId,
          `Created ${input.artifactType} version ${version}: ${input.title}`,
          JSON.stringify({ artifact_type: input.artifactType, version, artifact_id: inserted.rows[0].id }),
        ],
      );
      return inserted.rows[0];
    });
    if (!artifact) return errorResponse("Project not found.", 404);
    return NextResponse.json({ artifact }, { status: 201 });
  } catch (error) {
    const status = statusFor(error);
    if (status === 401) return errorResponse("Authentication required.", 401);
    if (status === 403) return errorResponse("Your workspace role does not allow artifact creation.", 403);
    if (status === 422) return errorResponse("Artifact details are invalid.", 422);
    return errorResponse("Unable to create project artifact.", 500);
  }
}
