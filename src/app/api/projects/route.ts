import { NextResponse } from "next/server";
import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { validateProjectInput } from "@/lib/projects/domain";

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

/** List projects visible to the current session, optionally within one selected workspace. */
export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspace_id");
  if (!workspaceId || !UUID_PATTERN.test(workspaceId)) {
    return jsonError("A valid workspace_id is required.", 422);
  }

  try {
    const projects = await withCurrentUserTransaction(async (client) => {
      const result = await client.query(
        `SELECT id, workspace_id, name, description, target, status, brief,
                created_at, updated_at
         FROM projects
         WHERE workspace_id = $1
         ORDER BY updated_at DESC, id ASC`,
        [workspaceId],
      );
      return result.rows;
    });
    return NextResponse.json({ projects });
  } catch (error) {
    const status = statusFor(error);
    return jsonError(status === 401 ? "Authentication required." : "Unable to list projects.", status);
  }
}

/** Create a project in a selected workspace; RLS enforces membership and editor role. */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return jsonError("Content-Type must be application/json.", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (!body || typeof body !== "object") {
    return jsonError("Request body must be a JSON object.", 400);
  }

  const input = body as Record<string, unknown>;
  if (typeof input.workspace_id !== "string" || !UUID_PATTERN.test(input.workspace_id)) {
    return jsonError("A valid workspace_id is required.", 422);
  }

  let projectInput: ReturnType<typeof validateProjectInput>;
  try {
    projectInput = validateProjectInput(input);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Project details are invalid.", 422);
  }

  try {
    const project = await withCurrentUserTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO projects (workspace_id, name, description, target, created_by)
         VALUES ($1, $2, $3, $4, current_setting('app.user_id')::uuid)
         RETURNING id, workspace_id, name, description, target, status, brief,
                   created_at, updated_at`,
        [input.workspace_id, projectInput.name, projectInput.description, projectInput.target],
      );
      return result.rows[0];
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const status = statusFor(error);
    if (status === 401) return jsonError("Authentication required.", 401);
    if (status === 403) return jsonError("You do not have permission to create projects in this workspace.", 403);
    if (status === 422) return jsonError("Project details are invalid.", 422);
    return jsonError("Unable to create project.", 500);
  }
}
