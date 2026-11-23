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
const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "10000000-0000-4000-8000-000000000002";

async function run() {
  // Verify the runtime connection is a separate non-privileged login.
  const roleInfo = await runtime.query(
    `SELECT session_user, r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb
     FROM pg_roles r WHERE r.rolname = session_user`,
  );
  assert.equal(roleInfo.rows[0]?.session_user, "synqforge_test_runtime");
  assert.equal(roleInfo.rows[0]?.rolsuper, false);
  assert.equal(roleInfo.rows[0]?.rolbypassrls, false);
  assert.equal(roleInfo.rows[0]?.rolcreaterole, false);
  assert.equal(roleInfo.rows[0]?.rolcreatedb, false);

  // The runtime login must not own application tables or have schema CREATE.
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
    "INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')",
    [workspaceA, userA, workspaceB, userB],
  );

  const visibleToA = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query("SELECT id FROM workspaces ORDER BY id");
    return result.rows.map((row) => row.id);
  });
  assert.deepEqual(visibleToA, [workspaceA], "user A must see only workspace A");

  const visibleToB = await withAuthenticatedUserTransaction(runtime, userB, async (client) => {
    const result = await client.query("SELECT id FROM workspaces ORDER BY id");
    return result.rows.map((row) => row.id);
  });
  assert.deepEqual(visibleToB, [workspaceB], "user B must see only workspace B after pooled connection reuse");

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
    withAuthenticatedUserTransaction(runtime, "not-a-uuid", async () => "unreachable"),
    /verified authenticated user UUID/,
    "adapter must reject invalid identity input",
  );

  console.log("PASS: dedicated runtime login is least-privileged; tenant isolation, pooled identity, bootstrap and denial checks succeeded.");
}
run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await runtime.end();
    await admin.end();
  });
