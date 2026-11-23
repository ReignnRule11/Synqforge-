import assert from "node:assert/strict";
import { Pool } from "pg";
import { withAuthenticatedUserTransaction } from "../src/lib/db/runtime";

const adminUrl = process.env.ADMIN_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("ADMIN_DATABASE_URL is required for fixture setup.");
if (!runtimeUrl) throw new Error("DATABASE_URL must use the dedicated runtime login.");

const admin = new Pool({ connectionString: adminUrl, max: 1 });
const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });

const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000005";
const adminUser = "20000000-0000-4000-8000-000000000002";
const memberUser = "20000000-0000-4000-8000-000000000003";
const viewerUser = "20000000-0000-4000-8000-000000000004";
const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "10000000-0000-4000-8000-000000000002";

async function run() {
  const roleInfo = await runtime.query(
    `SELECT session_user, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb
     FROM pg_roles r WHERE r.rolname = session_user`,
  );
  assert.equal(roleInfo.rows[0]?.session_user, "synqforge_test_runtime");
  assert.equal(roleInfo.rows[0]?.rolsuper, false);
  assert.equal(roleInfo.rows[0]?.rolbypassrls, false);
  assert.equal(roleInfo.rows[0]?.rolcreaterole, false);
  assert.equal(roleInfo.rows[0]?.rolcreatedb, false);

  const ownership = await runtime.query(
    `SELECT count(*)::int AS owned
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = session_user)`,
  );
  assert.equal(ownership.rows[0]?.owned, 0, "runtime login must not own public objects");
  await assert.rejects(runtime.query("CREATE TABLE public.runtime_forbidden_test (id integer)"), { code: "42501" },
    "runtime login must not create objects in public schema");

  await admin.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [[workspaceA, workspaceB]]);
  await admin.query(
    "INSERT INTO workspaces (id, name, slug) VALUES ($1, 'Runtime A', 'runtime-a'), ($2, 'Runtime B', 'runtime-b')",
    [workspaceA, workspaceB],
  );
  await admin.query(
    `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
      ($1, $2, 'owner'), ($1, $3, 'admin'), ($1, $4, 'member'), ($1, $5, 'viewer'), ($6, $7, 'owner')`,
    [workspaceA, userA, adminUser, memberUser, viewerUser, workspaceB, userB],
  );

  const visibleToA = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query(
      `SELECT w.id, m.role FROM workspaces w
       INNER JOIN workspace_memberships m ON m.workspace_id = w.id
       ORDER BY w.id`,
    );
    return result.rows;
  });
  assert.deepEqual(visibleToA, [{ id: workspaceA, role: "owner" }], "owner sees only own workspace and role");

  for (const [identity, role] of [[adminUser, "admin"], [memberUser, "member"], [viewerUser, "viewer"]] as const) {
    const visible = await withAuthenticatedUserTransaction(runtime, identity, async (client) => {
      const result = await client.query(
        `SELECT w.id, m.role FROM workspaces w
         INNER JOIN workspace_memberships m ON m.workspace_id = w.id`,
      );
      return result.rows;
    });
    assert.deepEqual(visible, [{ id: workspaceA, role }], `${role} sees only their workspace and assigned role`);
  }

  const visibleToB = await withAuthenticatedUserTransaction(runtime, userB, async (client) => {
    const result = await client.query("SELECT id FROM workspaces ORDER BY id");
    return result.rows.map((row) => row.id);
  });
  assert.deepEqual(visibleToB, [workspaceB], "tenant B must not see workspace A after pooled connection reuse");

  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) =>
      client.query("INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [workspaceA, userB]),
    ),
    { code: "42501" },
    "runtime must not directly mutate membership records",
  );

  const bootstrapId = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query("SELECT public.create_workspace($1, $2) AS id", ["Runtime bootstrap", "runtime-bootstrap"]);
    return result.rows[0].id as string;
  });
  const owner = await admin.query(
    "SELECT role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
    [bootstrapId, userA],
  );
  assert.equal(owner.rows[0]?.role, "owner", "workspace bootstrap must atomically assign owner membership");

  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) =>
      client.query("SELECT public.create_workspace($1, $2)", ["Duplicate slug", "runtime-bootstrap"]),
    ),
    { code: "23505" },
    "workspace slug collision must fail without creating a second workspace",
  );
  const collisionCount = await admin.query("SELECT count(*)::int AS count FROM workspaces WHERE slug = 'runtime-bootstrap'");
  assert.equal(collisionCount.rows[0]?.count, 1, "slug collision must not create a duplicate workspace");

  // Force the owner-membership insert to fail and verify the workspace insert rolls back.
  await admin.query(
    `CREATE OR REPLACE FUNCTION public.reject_workspace_membership_test()
     RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       IF NEW.workspace_id IN (SELECT id FROM public.workspaces WHERE slug = 'bootstrap-rollback') THEN
         RAISE EXCEPTION 'forced membership failure' USING ERRCODE = '23514';
       END IF;
       RETURN NEW;
     END $$`,
  );
  await admin.query(
    "CREATE TRIGGER reject_workspace_membership_test BEFORE INSERT ON workspace_memberships FOR EACH ROW EXECUTE FUNCTION public.reject_workspace_membership_test()",
  );
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) =>
      client.query("SELECT public.create_workspace($1, $2)", ["Rollback workspace", "bootstrap-rollback"]),
    ),
    { code: "23514" },
  );
  await admin.query("DROP TRIGGER reject_workspace_membership_test ON workspace_memberships");
  await admin.query("DROP FUNCTION public.reject_workspace_membership_test()");
  const rollbackCount = await admin.query("SELECT count(*)::int AS count FROM workspaces WHERE slug = 'bootstrap-rollback'");
  assert.equal(rollbackCount.rows[0]?.count, 0, "failed owner membership must roll back workspace creation");

  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, "not-a-uuid", async () => "unreachable"),
    /verified authenticated user UUID/,
    "adapter must reject invalid identity input",
  );

  console.log("PASS: least-privilege runtime, tenant isolation, role-scoped workspace listing, bootstrap atomicity, and denial checks.");
}
run()
  .catch(async (error) => {
    console.error(error);
    await admin.query("DROP TRIGGER IF EXISTS reject_workspace_membership_test ON workspace_memberships").catch(() => undefined);
    await admin.query("DROP FUNCTION IF EXISTS public.reject_workspace_membership_test()").catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await runtime.end();
    await admin.end();
  });
