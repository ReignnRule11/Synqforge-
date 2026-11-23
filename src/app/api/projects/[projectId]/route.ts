import { NextResponse } from "next/server";
import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { canTransitionProject, isProjectStatus, type ProjectStatus } from "@/lib/projects/domain";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(error: string, status: number) {
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

type RouteContext = { params: Promise<{ projectId: string }> };

/** Read one project visible to the authenticated user's current workspace memberships. */
export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) return jsonError("A valid project ID is required.", 422);

  try {
    const project = await withCurrentUserTransaction(async (client) => {
      const result = await client.query(
        `SELECT id, workspace_id, name, description, target, status, brief,
                created_at, updated_at
         FROM projects WHERE id = $1`,
        [projectId],
      );
      return result.rows[0] ?? null;
    });
    if (!project) return jsonError("Project not found.", 404);
    return NextResponse.json({ project });
  } catch (error) {
    const status = statusFor(error);
    return jsonError(status === 401 ? "Authentication required." : "Unable to load project.", status);
  }
}

/**
 * Transition a project through the domain lifecycle.
 * The row lock serializes competing transitions; RLS remains the authorization boundary.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) return jsonError("A valid project ID is required.", 422);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonError("Content-Type must be application/json.", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }
  if (!body || typeof body !== "object" || !isProjectStatus((body as Record<string, unknown>).status)) {
    return jsonError("A supported project status is required.", 422);
  }
  const nextStatus = (body as { status: ProjectStatus }).status;

  try {
    const result = await withCurrentUserTransaction(async (client) => {
      const current = await client.query(
        "SELECT id, workspace_id, status FROM projects WHERE id = $1 FOR UPDATE",
        [projectId],
      );
      const project = current.rows[0] as { id: string; workspace_id: string; status: ProjectStatus } | undefined;
      if (!project) return { kind: "not_found" as const };
      if (!canTransitionProject(project.status, nextStatus)) {
        return { kind: "invalid_transition" as const, currentStatus: project.status };
      }
      if (project.status === nextStatus) {
        const unchanged = await client.query(
          `SELECT id, workspace_id, name, description, target, status, brief,
                  created_at, updated_at FROM projects WHERE id = $1`,
          [projectId],
        );
        return { kind: "ok" as const, project: unchanged.rows[0] };
      }

      const updated = await client.query(
        `UPDATE projects SET status = $2, updated_at = now()
         WHERE id = $1 AND status = $3
         RETURNING id, workspace_id, name, description, target, status, brief,
                   created_at, updated_at`,
        [projectId, nextStatus, project.status],
      );
      if (!updated.rows[0]) return { kind: "conflict" as const };

      await client.query(
        `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary, metadata)
         VALUES ($1, $2, current_setting('app.user_id')::uuid, 'project.status_changed', $3, $4::jsonb)`,
        [
          project.workspace_id,
          projectId,
          `Project moved from ${project.status} to ${nextStatus}.`,
          JSON.stringify({ from: project.status, to: nextStatus }),
        ],
      );
      return { kind: "ok" as const, project: updated.rows[0] };
    });

    if (result.kind === "not_found") return jsonError("Project not found.", 404);
    if (result.kind === "invalid_transition") {
      return NextResponse.json(
        { error: `Invalid project transition: ${result.currentStatus} -> ${nextStatus}`, current_status: result.currentStatus },
        { status: 422 },
      );
    }
    if (result.kind === "conflict") return jsonError("Project changed concurrently. Reload and try again.", 409);
    return NextResponse.json({ project: result.project });
  } catch (error) {
    const status = statusFor(error);
    if (status === 401) return jsonError("Authentication required.", 401);
    if (status === 403) return jsonError("Your workspace role does not allow project updates.", 403);
    return jsonError("Unable to update project.", status);
  }
}
