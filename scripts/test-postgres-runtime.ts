import assert from "node:assert/strict";
import { Pool } from "pg";
import { withAuthenticatedUserTransaction } from "../src/lib/db/runtime";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for PostgreSQL runtime tests.");

const admin = new Pool({ connectionString: databaseUrl, max: 1 });
const runtime = new Pool({ connectionString: databaseUrl, max: 1 });

const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000005";
const workspaceA = "10000000-0000-4000-8000-000000000001";
const workspaceB = "10000000-0000-4000-8000-000000000002";

async function run() {
  await admin.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [[workspaceA, workspaceB]]);
  await admin.query(
    "INSERT INTO workspaces (id, name, slug) VALUES ($1, 'Runtime A', 'runtime-a'), ($2, 'Runtime B', 'runtime-b')",
    [workspaceA, workspaceB],
  );
  await admin.query(
    "INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')",
    [workspaceA, userA, workspaceB, userB],
  );

  // One connection is reused. Transaction-local identity must never survive between calls.
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

  console.log("PASS: pooled transactions isolate identity; tenant reads are scoped; bootstrap creates owner membership.");
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
