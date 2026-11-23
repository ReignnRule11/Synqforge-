-- PostgreSQL integration tests for Project Engine RLS and workspace bootstrap.
-- Run as the database migration/test administrator after migrations 0001-0003.
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert_true(p_ok boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_message;
  END IF;
END
$$;

-- Deterministic fixtures are inserted by the test administrator.
INSERT INTO workspaces (id, name, slug) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Workspace A', 'workspace-a'),
  ('10000000-0000-4000-8000-000000000002', 'Workspace B', 'workspace-b');

INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'admin'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'member'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', 'viewer'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', 'owner');

INSERT INTO projects (id, workspace_id, name, target, created_by) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Project A', 'web', '20000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Project B', 'web', '20000000-0000-4000-8000-000000000005');

INSERT INTO project_artifacts (workspace_id, project_id, artifact_type, title, version, content, created_by)
VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
        'prd', 'Initial PRD', 1, '{"body":"v1"}', '20000000-0000-4000-8000-000000000001');

INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary)
VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001', 'created', 'Project created');

GRANT USAGE ON SCHEMA public TO synqforge_app;

-- Owner: read, create/update/delete projects; bootstrap is atomic and creates owner membership.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000001', true);
DO $$
DECLARE v_workspace uuid;
BEGIN
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM projects WHERE id = '30000000-0000-4000-8000-000000000001'), 'owner reads own workspace project');
  PERFORM pg_temp.assert_true((SELECT count(*) = 0 FROM projects WHERE id = '30000000-0000-4000-8000-000000000002'), 'owner cannot read another workspace project');
  INSERT INTO projects (workspace_id, name, target, created_by)
  VALUES ('10000000-0000-4000-8000-000000000001', 'Owner created', 'web', '20000000-0000-4000-8000-000000000001');
  UPDATE projects SET description = 'updated' WHERE id = '30000000-0000-4000-8000-000000000001';
  DELETE FROM projects WHERE name = 'Owner created';
  v_workspace := public.create_workspace('New workspace', 'new-workspace');
  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM workspace_memberships WHERE workspace_id = v_workspace
            AND user_id = '20000000-0000-4000-8000-000000000001' AND role = 'owner'),
    'bootstrap atomically provisions caller as owner'
  );
END
$$;
RESET ROLE;

-- Admin can edit projects but cannot delete the workspace.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000002', true);
DO $$
BEGIN
  INSERT INTO projects (workspace_id, name, target, created_by)
  VALUES ('10000000-0000-4000-8000-000000000001', 'Admin created', 'web', '20000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM projects WHERE name = 'Admin created'), 'admin can create projects');
  DELETE FROM workspaces WHERE id = '10000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM workspaces WHERE id = '10000000-0000-4000-8000-000000000001'), 'admin cannot delete workspace');
END
$$;
RESET ROLE;

-- Member can create/update, but cannot delete projects.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000003', true);
DO $$
BEGIN
  INSERT INTO projects (workspace_id, name, target, created_by)
  VALUES ('10000000-0000-4000-8000-000000000001', 'Member created', 'web', '20000000-0000-4000-8000-000000000003');
  DELETE FROM projects WHERE id = '30000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM projects WHERE id = '30000000-0000-4000-8000-000000000001'), 'member cannot delete project');
END
$$;
RESET ROLE;

-- Viewer can read, but inserts are rejected by RLS.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000004', true);
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM projects WHERE id = '30000000-0000-4000-8000-000000000001'), 'viewer can read project');
  BEGIN
    INSERT INTO projects (workspace_id, name, target, created_by)
    VALUES ('10000000-0000-4000-8000-000000000001', 'Viewer forbidden', 'web', '20000000-0000-4000-8000-000000000004');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  PERFORM pg_temp.assert_true(v_blocked, 'viewer cannot create project');
END
$$;
RESET ROLE;

-- Cross-tenant user sees no rows and cannot append to another tenant.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000005', true);
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assert_true((SELECT count(*) = 0 FROM projects WHERE id = '30000000-0000-4000-8000-000000000001'), 'cross-tenant project read is isolated');
  BEGIN
    INSERT INTO project_activity (workspace_id, project_id, actor_id, event_type, summary)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000005', 'attack', 'cross-tenant');
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  PERFORM pg_temp.assert_true(v_blocked, 'cross-tenant activity write is blocked');
END
$$;
RESET ROLE;

-- Artifact and activity rows are append-only for application roles.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000001', true);
DO $$
BEGIN
  UPDATE project_artifacts SET title = 'tampered' WHERE title = 'Initial PRD';
  PERFORM pg_temp.assert_true((SELECT title = 'Initial PRD' FROM project_artifacts WHERE title = 'Initial PRD'), 'artifact update is blocked');
  DELETE FROM project_artifacts WHERE title = 'Initial PRD';
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM project_artifacts WHERE title = 'Initial PRD'), 'artifact delete is blocked');
  UPDATE project_activity SET summary = 'tampered' WHERE summary = 'Project created';
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM project_activity WHERE summary = 'Project created'), 'activity update is blocked');
  DELETE FROM project_activity WHERE summary = 'Project created';
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM project_activity WHERE summary = 'Project created'), 'activity delete is blocked');
END
$$;
RESET ROLE;

-- No transaction-local identity means no workspace visibility and no bootstrap.
SET LOCAL ROLE synqforge_app;
SELECT set_config('app.user_id', '', true);
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assert_true((SELECT count(*) = 0 FROM projects) , 'missing identity has no project visibility');
  BEGIN
    PERFORM public.create_workspace('No identity', 'no-identity');
  EXCEPTION WHEN SQLSTATE '28000' THEN v_blocked := true;
  END;
  PERFORM pg_temp.assert_true(v_blocked, 'bootstrap rejects missing identity');
END
$$;
RESET ROLE;

ROLLBACK;
