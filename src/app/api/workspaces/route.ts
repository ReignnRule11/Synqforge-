import { NextResponse } from "next/server";
import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import { parseWorkspaceName } from "@/lib/workspaces/domain";

export const runtime = "nodejs";

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function statusFor(error: unknown): number {
  if (!error || typeof error !== "object") return 500;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return 409;
  if (code === "22023") return 422;
  if (error instanceof Error && error.message === "A verified session UUID is required.") return 401;
  return 500;
}

/** List only workspaces visible through the current user's membership and RLS. */
export async function GET() {
  try {
    const workspaces = await withCurrentUserTransaction(async (client) => {
      const result = await client.query(
        `SELECT w.id, w.name, w.slug, m.role, w.created_at
         FROM workspaces w
         INNER JOIN workspace_memberships m ON m.workspace_id = w.id
         ORDER BY w.created_at DESC, w.id ASC`,
      );
      return result.rows;
    });
    return NextResponse.json({ workspaces });
  } catch (error) {
    const status = statusFor(error);
    return jsonError(status === 401 ? "Authentication required." : "Unable to list workspaces.", status);
  }
}

/** Create a workspace and its owner membership atomically in PostgreSQL. */
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

  const name = body && typeof body === "object" && "name" in body
    ? parseWorkspaceName((body as { name?: unknown }).name)
    : null;
  if (!name) return jsonError("Workspace name must be 2–100 characters and produce a valid URL slug.", 422);

  try {
    const workspace = await withCurrentUserTransaction(async (client) => {
      const created = await client.query<{ id: string }>(
        "SELECT public.create_workspace($1, $2) AS id",
        [name.name, name.slug],
      );
      const result = await client.query(
        `SELECT w.id, w.name, w.slug, m.role, w.created_at
         FROM workspaces w
         INNER JOIN workspace_memberships m ON m.workspace_id = w.id
         WHERE w.id = $1`,
        [created.rows[0].id],
      );
      if (!result.rows[0]) throw new Error("Workspace bootstrap did not return a visible workspace.");
      return result.rows[0];
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    const status = statusFor(error);
    if (status === 409) return jsonError("That workspace URL is already in use. Change the workspace name and try again.", 409);
    if (status === 401) return jsonError("Authentication required.", 401);
    if (status === 422) return jsonError("Workspace details are invalid.", 422);
    return jsonError("Unable to create workspace.", 500);
  }
}
