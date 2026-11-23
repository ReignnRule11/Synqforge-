import { NextResponse } from "next/server";
import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { generatePrd } from "@/lib/ai/gateway";
import { createProviderConfig } from "@/lib/ai/provider";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ projectId: string }> };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function statusFor(error: unknown): number {
  if (!error || typeof error !== "object") return 500;
  const code = (error as { code?: unknown }).code;
  if (code === "42501") return 403;
  if (code === "22P02" || code === "22023") return 422;
  if (error instanceof Error && error.message === "A verified session UUID is required.") return 401;
  return 500;
}

/**
 * Generate a first-draft PRD. The caller must explicitly consent to sending
 * this project's brief to the currently configured external AI provider.
 */
/** Return the selected provider so the UI can disclose the recipient before consent. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) return errorResponse("A valid project ID is required.", 422);
  try {
    const access = await withCurrentUserTransaction(async (client) => {
      const result = await client.query(
        `SELECT m.role
         FROM projects p
         JOIN workspace_memberships m
           ON m.workspace_id = p.workspace_id
          AND m.user_id = current_setting('app.user_id')::uuid
         WHERE p.id = $1`,
        [projectId],
      );
      return result.rows[0] as { role: string } | undefined;
    });
    if (!access) return errorResponse("Project not found.", 404);
    const configured = createProviderConfig();
    return NextResponse.json({ provider: configured.provider, model: configured.config.model });
  } catch (error) {
    const status = statusFor(error);
    if (status === 401) return errorResponse("Authentication required.", 401);
    if (status === 403) return errorResponse("You do not have access to this project.", 403);
    return errorResponse("AI provider is not configured.", 503);
  }
}

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
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body as Record<string, unknown>).some((key) => key !== "consent") ||
      (body as Record<string, unknown>).consent !== true) {
    return errorResponse("Explicit consent is required before project data is sent to the configured AI provider.", 428);
  }

  let providerName: string;
  try {
    providerName = createProviderConfig().provider;
  } catch {
    return errorResponse("AI generation is not configured. Contact the workspace administrator.", 503);
  }

  try {
    // Authorize before any project content leaves the application.
    const project = await withCurrentUserTransaction(async (client) => {
      const result = await client.query(
        `SELECT p.id, p.workspace_id, p.name, p.description, p.target, p.brief,
                m.role
         FROM projects p
         JOIN workspace_memberships m
           ON m.workspace_id = p.workspace_id
          AND m.user_id = current_setting('app.user_id')::uuid
         WHERE p.id = $1`,
        [projectId],
      );
      const row = result.rows[0] as {
        id: string; workspace_id: string; name: string; description: string;
        target: string; brief: unknown; role: string;
      } | undefined;
      if (!row) return { kind: "not_found" as const };
      if (!["owner", "admin", "member"].includes(row.role)) return { kind: "forbidden" as const };
      return { kind: "ok" as const, project: row };
    });

    if (project.kind === "not_found") return errorResponse("Project not found.", 404);
    if (project.kind === "forbidden") return errorResponse("Your workspace role does not allow PRD generation.", 403);

    let prd;
    try {
      prd = await generatePrd({
        name: project.project.name,
        description: project.project.description,
        target: project.project.target,
        brief: project.project.brief,
      });
    } catch {
      return errorResponse("The configured AI provider could not produce a valid PRD. No artifact was saved.", 502);
    }

    // Re-authorize after the network call. A role revoked during generation
    // must not leave behind a newly persisted artifact.
    const artifact = await withCurrentUserTransaction(async (client) => {
      const access = await client.query(
        `SELECT p.workspace_id, m.role
         FROM projects p
         JOIN workspace_memberships m
           ON m.workspace_id = p.workspace_id
          AND m.user_id = current_setting('app.user_id')::uuid
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [projectId],
      );
      const current = access.rows[0] as { workspace_id: string; role: string } | undefined;
      if (!current) return { kind: "not_found" as const };
      if (!["owner", "admin", "member"].includes(current.role)) return { kind: "forbidden" as const };

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${projectId}:prd`],
      );
      const versionResult = await client.query(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM project_artifacts WHERE project_id = $1 AND artifact_type = 'prd'",
        [projectId],
      );
      const version = Number(versionResult.rows[0].next_version);
      const inserted = await client.query(
        `INSERT INTO project_artifacts
           (workspace_id, project_id, artifact_type, title, version, content, created_by)
         VALUES ($1, $2, 'prd', $3, $4, $5::jsonb, current_setting('app.user_id')::uuid)
         RETURNING id, workspace_id, project_id, artifact_type, title, version,
                   content, created_by, created_at`,
        [current.workspace_id, projectId, prd.title, version, JSON.stringify(prd)],
      );
      await client.query(
        `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary, metadata)
         VALUES ($1, $2, current_setting('app.user_id')::uuid, 'artifact.version_created', $3, $4::jsonb)`,
        [
          current.workspace_id,
          projectId,
          `Generated PRD version ${version} with ${providerName}.`,
          JSON.stringify({ artifact_type: "prd", version, artifact_id: inserted.rows[0].id, provider: providerName }),
        ],
      );
      return { kind: "ok" as const, artifact: inserted.rows[0] };
    });

    if (artifact.kind === "not_found") return errorResponse("Project access changed during generation. No artifact was saved.", 404);
    if (artifact.kind === "forbidden") return errorResponse("Your workspace role changed during generation. No artifact was saved.", 403);
    return NextResponse.json({ artifact: artifact.artifact, provider: providerName }, { status: 201 });
  } catch (error) {
    const status = statusFor(error);
    if (status === 401) return errorResponse("Authentication required.", 401);
    if (status === 403) return errorResponse("Your workspace role does not allow PRD generation.", 403);
    return errorResponse("Unable to generate or save the project PRD.", status);
  }
}
