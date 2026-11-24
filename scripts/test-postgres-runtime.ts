import assert from "node:assert/strict";
import { Pool } from "pg";
import { withAuthenticatedUserTransaction } from "../src/lib/db/runtime";
import { createCurrentUserTransaction } from "../src/lib/auth/current-user-transaction";
import { githubUserIdToUuid } from "../src/lib/auth/identity";

const adminUrl = process.env.ADMIN_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("ADMIN_DATABASE_URL is required for fixture setup.");
if (!runtimeUrl) throw new Error("DATABASE_URL must use the dedicated runtime login.");

const admin = new Pool({ connectionString: adminUrl, max: 1 });
const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
const concurrentRuntime = new Pool({ connectionString: runtimeUrl, max: 2 });

const userA = githubUserIdToUuid("222224725");
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

  // Exercise the same session -> current-user transaction composition used by
  // src/lib/auth/authenticated-db.ts, with a deterministic verified-session fixture
  // and a real restricted PostgreSQL runtime pool.
  const withCurrentUserTransaction = createCurrentUserTransaction(
    async () => ({ user: { id: userA } }),
    () => runtime,
    withAuthenticatedUserTransaction,
  );
  const sessionBoundContext = await withCurrentUserTransaction(async (client) => {
    const result = await client.query(
      `SELECT current_user, current_setting('app.user_id', true) AS app_user_id,
              (SELECT count(*)::int FROM workspaces) AS visible_workspace_count`,
    );
    return result.rows[0] as {
      current_user: string;
      app_user_id: string;
      visible_workspace_count: number;
    };
  });
  assert.equal(sessionBoundContext.current_user, "synqforge_app");
  assert.equal(sessionBoundContext.app_user_id, userA,
    "verified session identity must become the transaction-local PostgreSQL identity");
  assert.equal(sessionBoundContext.visible_workspace_count, 1,
    "session-derived identity must be enforced by PostgreSQL RLS");

  let deniedSessionWorkRan = false;
  const withInvalidSession = createCurrentUserTransaction(
    async () => ({ user: { id: "not-a-verified-uuid" } }),
    () => runtime,
    withAuthenticatedUserTransaction,
  );
  await assert.rejects(
    withInvalidSession(async () => {
      deniedSessionWorkRan = true;
      return "must-not-run";
    }),
    /verified session UUID/,
  );
  assert.equal(deniedSessionWorkRan, false,
    "invalid session identity must be rejected before PostgreSQL work begins");

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

  // Verify transaction-local role and identity are visible only inside the transaction.
  const userBContext = await withAuthenticatedUserTransaction(runtime, userB, async (client) => {
    const result = await client.query(
      "SELECT session_user, current_user, current_setting('app.user_id', true) AS app_user_id",
    );
    return result.rows[0] as { session_user: string; current_user: string; app_user_id: string };
  });
  assert.equal(userBContext.session_user, "synqforge_test_runtime");
  assert.equal(userBContext.current_user, "synqforge_app");
  assert.equal(userBContext.app_user_id, userB, "transaction must expose only the verified tenant identity");

  // A failed transaction must roll back both its data and its transaction-local context.
  const rollbackSlug = "runtime-transaction-rollback";
  await admin.query("DELETE FROM workspaces WHERE slug = $1", [rollbackSlug]);
  const forcedFailure = new Error("forced runtime transaction failure");
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) => {
      await client.query("SELECT public.create_workspace($1, $2)", ["Must roll back", rollbackSlug]);
      const context = await client.query(
        "SELECT current_user, current_setting('app.user_id', true) AS app_user_id",
      );
      assert.equal(context.rows[0]?.current_user, "synqforge_app");
      assert.equal(context.rows[0]?.app_user_id, userA);
      throw forcedFailure;
    }),
    (error: unknown) => error === forcedFailure,
  );
  const rolledBackWorkspace = await admin.query(
    "SELECT count(*)::int AS count FROM workspaces WHERE slug = $1",
    [rollbackSlug],
  );
  assert.equal(rolledBackWorkspace.rows[0]?.count, 0, "failed runtime transaction must roll back inserted data");

  // The single-connection pool must safely serve tenant B after tenant A rolls back.
  const afterRollback = await withAuthenticatedUserTransaction(runtime, userB, async (client) => {
    const result = await client.query(
      "SELECT current_user, current_setting('app.user_id', true) AS app_user_id",
    );
    return result.rows[0] as { current_user: string; app_user_id: string };
  });
  assert.equal(afterRollback.current_user, "synqforge_app");
  assert.equal(afterRollback.app_user_id, userB, "rollback must not leak tenant A identity into tenant B");

  // After COMMIT/ROLLBACK, the pooled session must return to its restricted login role
  // with no authenticated user identity left behind.
  const idleContext = await runtime.query(
    "SELECT session_user, current_user, current_setting('app.user_id', true) AS app_user_id",
  );
  assert.equal(idleContext.rows[0]?.session_user, "synqforge_test_runtime");
  assert.equal(idleContext.rows[0]?.current_user, "synqforge_test_runtime");
  assert.notEqual(idleContext.rows[0]?.app_user_id, userA);
  assert.notEqual(idleContext.rows[0]?.app_user_id, userB);

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
     RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS 'BEGIN
       IF NEW.workspace_id IN (SELECT id FROM public.workspaces WHERE slug = ''bootstrap-rollback'') THEN
         RAISE EXCEPTION ''forced membership failure'' USING ERRCODE = ''23514'';
       END IF;
       RETURN NEW;
     END;'`,
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

  const ownerProject = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query(
      `INSERT INTO projects (workspace_id, name, description, target, created_by)
       VALUES ($1, 'Owner project', 'Created through the restricted runtime', 'web',
               current_setting('app.user_id')::uuid)
       RETURNING id, workspace_id, created_by`,
      [workspaceA],
    );
    return result.rows[0] as { id: string; workspace_id: string; created_by: string };
  });
  assert.equal(ownerProject.workspace_id, workspaceA);
  assert.equal(ownerProject.created_by, userA, "creator identity must come from transaction context");

  const ownerTransition = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query("UPDATE projects SET status = 'discovery', updated_at = now() WHERE id = $1 RETURNING status", [ownerProject.id]);
    return result.rows[0]?.status;
  });
  assert.equal(ownerTransition, "discovery", "owner can update a project lifecycle status");

  const firstArtifact = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query(
      `INSERT INTO project_artifacts (workspace_id, project_id, artifact_type, title, version, content, created_by)
       VALUES ($1, $2, 'prd', 'Product requirements', 1, '{"summary":"Initial PRD"}'::jsonb, current_setting('app.user_id')::uuid)
       RETURNING id, version`,
      [workspaceA, ownerProject.id],
    );
    return result.rows[0];
  });
  assert.equal(firstArtifact.version, 1, "first artifact version is one");

  // A failed artifact write must not leave either the immutable version or its activity event.
  const rollbackArtifactTitle = "Artifact rollback verification";
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) => {
      const inserted = await client.query(
        `INSERT INTO project_artifacts (workspace_id, project_id, artifact_type, title, version, content, created_by)
         VALUES ($1, $2, 'test_report', $3, 1, '{"state":"must-rollback"}'::jsonb, current_setting('app.user_id')::uuid)
         RETURNING id`,
        [workspaceA, ownerProject.id, rollbackArtifactTitle],
      );
      await client.query(
        `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary, metadata)
         VALUES ($1, $2, current_setting('app.user_id')::uuid, 'artifact.version_created', $3, $4::jsonb)`,
        [workspaceA, ownerProject.id, rollbackArtifactTitle, JSON.stringify({ artifact_id: inserted.rows[0].id })],
      );
      throw new Error("forced artifact transaction failure");
    }),
    /forced artifact transaction failure/,
  );
  const rolledBackArtifact = await admin.query(
    "SELECT count(*)::int AS count FROM project_artifacts WHERE project_id = $1 AND title = $2",
    [ownerProject.id, rollbackArtifactTitle],
  );
  assert.equal(rolledBackArtifact.rows[0]?.count, 0, "artifact insert must roll back with transaction");
  const rolledBackActivity = await admin.query(
    "SELECT count(*)::int AS count FROM project_activity WHERE project_id = $1 AND summary = $2",
    [ownerProject.id, rollbackArtifactTitle],
  );
  assert.equal(rolledBackActivity.rows[0]?.count, 0, "activity event must roll back with artifact insert");

  // Two concurrent writers serialize version allocation using the same transaction-scoped advisory lock.
  const concurrentArtifactType = "test_report";
  const appendConcurrentArtifact = (title: string) =>
    withAuthenticatedUserTransaction(concurrentRuntime, userA, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`${ownerProject.id}:${concurrentArtifactType}`],
      );
      const next = await client.query(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM project_artifacts WHERE project_id = $1 AND artifact_type = $2",
        [ownerProject.id, concurrentArtifactType],
      );
      const version = Number(next.rows[0].next_version);
      const inserted = await client.query(
        `INSERT INTO project_artifacts (workspace_id, project_id, artifact_type, title, version, content, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, current_setting('app.user_id')::uuid)
         RETURNING id, version`,
        [workspaceA, ownerProject.id, concurrentArtifactType, title, version, JSON.stringify({ title })],
      );
      await client.query(
        `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary, metadata)
         VALUES ($1, $2, current_setting('app.user_id')::uuid, 'artifact.version_created', $3, $4::jsonb)`,
        [workspaceA, ownerProject.id, title, JSON.stringify({ artifact_id: inserted.rows[0].id, version })],
      );
      return inserted.rows[0] as { id: string; version: number };
    });
  const concurrentResults = await Promise.all([
    appendConcurrentArtifact("Concurrent report A"),
    appendConcurrentArtifact("Concurrent report B"),
  ]);
  assert.deepEqual(
    concurrentResults.map((item) => item.version).sort((a, b) => a - b),
    [1, 2],
    "concurrent writers must receive distinct sequential versions",
  );
  const concurrentEvents = await admin.query(
    `SELECT a.version, COUNT(e.id)::int AS event_count
     FROM project_artifacts a
     LEFT JOIN project_activity e
       ON e.project_id = a.project_id
      AND e.event_type = 'artifact.version_created'
      AND (e.metadata->>'artifact_id')::text = a.id::text
     WHERE a.project_id = $1 AND a.artifact_type = $2
     GROUP BY a.version ORDER BY a.version`,
    [ownerProject.id, concurrentArtifactType],
  );
  assert.deepEqual(
    concurrentEvents.rows.map((row) => ({ version: row.version, event_count: row.event_count })),
    [{ version: 1, event_count: 1 }, { version: 2, event_count: 1 }],
    "each committed artifact version must have exactly one corresponding activity event",
  );

  // Idempotency records are workspace-scoped, editor-writable, and unique per operation/key.
  const idempotencyArtifactId = concurrentResults[0].id;
  await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    await client.query(
      `INSERT INTO project_artifact_idempotency
         (workspace_id, project_id, operation, idempotency_key, request_hash, artifact_id)
       VALUES ($1, $2, 'artifact.create', $3, $4, $5)`,
      [workspaceA, ownerProject.id, "runtime-artifact-key-001", "a".repeat(64), idempotencyArtifactId],
    );
  });
  const visibleIdempotency = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query(
      "SELECT artifact_id FROM project_artifact_idempotency WHERE project_id = $1 AND idempotency_key = $2",
      [ownerProject.id, "runtime-artifact-key-001"],
    );
    return result.rows;
  });
  assert.deepEqual(visibleIdempotency, [{ artifact_id: idempotencyArtifactId }]);
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) =>
      client.query(
        `INSERT INTO project_artifact_idempotency
           (workspace_id, project_id, operation, idempotency_key, request_hash, artifact_id)
         VALUES ($1, $2, 'artifact.create', $3, $4, $5)`,
        [workspaceA, ownerProject.id, "runtime-artifact-key-001", "b".repeat(64), idempotencyArtifactId],
      ),
    ),
    { code: "23505" },
    "a workspace/project/operation idempotency key cannot be claimed twice",
  );
  const tenantBIdempotency = await withAuthenticatedUserTransaction(runtime, userB, async (client) =>
    client.query("SELECT id FROM project_artifact_idempotency WHERE project_id = $1", [ownerProject.id]),
  );
  assert.equal(tenantBIdempotency.rows.length, 0, "idempotency records must remain tenant-isolated");
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, viewerUser, async (client) =>
      client.query(
        `INSERT INTO project_artifact_idempotency
           (workspace_id, project_id, operation, idempotency_key, request_hash, artifact_id)
         VALUES ($1, $2, 'artifact.create', $3, $4, $5)`,
        [workspaceA, ownerProject.id, "viewer-key-0001", "c".repeat(64), idempotencyArtifactId],
      ),
    ),
    { code: "42501" },
    "viewers cannot create artifact idempotency records",
  );

  const memberArtifact = await withAuthenticatedUserTransaction(runtime, memberUser, async (client) => {
    const result = await client.query(
      `INSERT INTO project_artifacts (workspace_id, project_id, artifact_type, title, version, content, created_by)
       VALUES ($1, $2, 'prd', 'Product requirements update', 2, '{"summary":"Revised PRD"}'::jsonb, current_setting('app.user_id')::uuid)
       RETURNING id, version`,
      [workspaceA, ownerProject.id],
    );
    return result.rows[0];
  });
  assert.equal(memberArtifact.version, 2, "workspace editor can append a subsequent artifact version");

  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, viewerUser, async (client) =>
      client.query(
        `INSERT INTO project_artifacts (workspace_id, project_id, artifact_type, title, version, content, created_by)
         VALUES ($1, $2, 'prd', 'Viewer forbidden', 3, '{}'::jsonb, current_setting('app.user_id')::uuid)`,
        [workspaceA, ownerProject.id],
      ),
    ),
    { code: "42501" },
    "viewer cannot append project artifact versions",
  );

  const crossTenantArtifacts = await withAuthenticatedUserTransaction(runtime, userB, async (client) =>
    client.query("SELECT id FROM project_artifacts WHERE project_id = $1", [ownerProject.id]),
  );
  assert.equal(crossTenantArtifacts.rows.length, 0, "cross-tenant artifact reads must return no rows");

  const immutableArtifact = await withAuthenticatedUserTransaction(runtime, userA, async (client) =>
    client.query("UPDATE project_artifacts SET title = 'tampered' WHERE id = $1 RETURNING id", [firstArtifact.id]),
  );
  assert.equal(immutableArtifact.rows.length, 0, "artifact versions cannot be edited in place");

  const memberProject = await withAuthenticatedUserTransaction(runtime, memberUser, async (client) => {
    const result = await client.query(
      `INSERT INTO projects (workspace_id, name, target, created_by)
       VALUES ($1, 'Member project', 'mobile', current_setting('app.user_id')::uuid)
       RETURNING id`,
      [workspaceA],
    );
    return result.rows[0].id as string;
  });
  assert.ok(memberProject, "workspace members with editor role can create projects");

  const ownerProjects = await withAuthenticatedUserTransaction(runtime, userA, async (client) => {
    const result = await client.query(
      "SELECT id FROM projects WHERE workspace_id = $1 ORDER BY name",
      [workspaceA],
    );
    return result.rows.map((row) => row.id);
  });
  assert.ok(ownerProjects.includes(ownerProject.id), "owner can list projects in own workspace");
  assert.ok(ownerProjects.includes(memberProject), "owner can list member-created projects");

  const memberTransition = await withAuthenticatedUserTransaction(runtime, memberUser, async (client) => {
    const result = await client.query("UPDATE projects SET status = 'planning', updated_at = now() WHERE id = $1 RETURNING status", [ownerProject.id]);
    return result.rows[0]?.status;
  });
  assert.equal(memberTransition, "planning", "member editor can update a project lifecycle status");

  const viewerUpdate = await withAuthenticatedUserTransaction(runtime, viewerUser, async (client) =>
    client.query("UPDATE projects SET status = 'design' WHERE id = $1 RETURNING id", [ownerProject.id]),
  );
  assert.equal(viewerUpdate.rows.length, 0, "viewer RLS policy must silently filter project lifecycle updates");

  const crossTenantUpdate = await withAuthenticatedUserTransaction(runtime, userB, async (client) =>
    client.query("UPDATE projects SET status = 'archived' WHERE id = $1 RETURNING id", [ownerProject.id]),
  );
  assert.equal(crossTenantUpdate.rows.length, 0, "cross-tenant lifecycle update must not reveal or modify a project");

  await withAuthenticatedUserTransaction(runtime, userA, async (client) =>
    client.query(
      `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary, metadata)
       VALUES ($1, $2, current_setting('app.user_id')::uuid, 'project.status_changed', 'Project moved to planning.', '{"from":"discovery","to":"planning"}'::jsonb)`,
      [workspaceA, ownerProject.id],
    ),
  );
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, viewerUser, async (client) =>
      client.query(
        `INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary)
         VALUES ($1, $2, current_setting('app.user_id')::uuid, 'project.status_changed', 'forbidden')`,
        [workspaceA, ownerProject.id],
      ),
    ),
    { code: "42501" },
    "viewer must not append project lifecycle activity",
  );
  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userA, async (client) =>
      client.query(
        `INSERT INTO projects (workspace_id, name, target, created_by)
         VALUES ($1, 'Forged creator', 'web', $2)`,
        [workspaceA, userB],
      ),
    ),
    { code: "42501" },
    "creator identity must not be forgeable even inside an otherwise authorized workspace",
  );

  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, viewerUser, async (client) =>
      client.query(
        `INSERT INTO projects (workspace_id, name, target, created_by)
         VALUES ($1, 'Viewer forbidden', 'web', current_setting('app.user_id')::uuid)`,
        [workspaceA],
      ),
    ),
    { code: "42501" },
    "viewer must not create projects",
  );

  await assert.rejects(
    withAuthenticatedUserTransaction(runtime, userB, async (client) =>
      client.query(
        `INSERT INTO projects (workspace_id, name, target, created_by)
         VALUES ($1, 'Cross-tenant attack', 'web', current_setting('app.user_id')::uuid)`,
        [workspaceA],
      ),
    ),
    { code: "42501" },
    "a valid workspace UUID must not bypass tenant membership checks",
  );

  const tenantBProjects = await withAuthenticatedUserTransaction(runtime, userB, async (client) => {
    const result = await client.query("SELECT id FROM projects WHERE workspace_id = $1", [workspaceA]);
    return result.rows;
  });
  assert.equal(tenantBProjects.length, 0, "cross-tenant project listing must return no rows");

  console.log("PASS: least-privilege runtime, tenant isolation, workspace bootstrap, project creation, lifecycle update, activity append authorization, and denial checks.");
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
    await concurrentRuntime.end();
    await admin.end();
  });
