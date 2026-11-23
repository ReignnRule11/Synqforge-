import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { withCurrentUserTransaction } from "@/lib/auth/authenticated-db";
import WorkspaceDashboard from "./workspace-dashboard";

export const dynamic = "force-dynamic";

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | "viewer";
  created_at: string;
};

/** Render only workspaces visible to the verified session under PostgreSQL RLS. */
export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const workspaces = await withCurrentUserTransaction(async (client) => {
    const result = await client.query<WorkspaceRow>(
      `SELECT w.id, w.name, w.slug, m.role, w.created_at
       FROM workspaces w
       INNER JOIN workspace_memberships m ON m.workspace_id = w.id
       ORDER BY w.created_at DESC, w.id ASC`,
    );
    return result.rows;
  });

  return (
    <WorkspaceDashboard
      initialWorkspaces={workspaces}
      userName={session.user.name || session.user.email || "SynqForge user"}
      userEmail={session.user.email || ""}
    />
  );
}
