-- Tighten Project Engine authorization by workspace role.
-- Apply after 0001_project_engine.sql with the migration identity.
-- Runtime transactions must set app.user_id from a verified auth session.
-- Runtime DB role must not own these tables and must not have BYPASSRLS.

-- Workspace visibility remains available to every member. Only owners/admins
-- can rename a workspace; only owners can delete it.
DROP POLICY IF EXISTS workspace_member_read ON workspaces;
CREATE POLICY workspace_member_read ON workspaces FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = workspaces.id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY workspace_owner_admin_update ON workspaces FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = workspaces.id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = workspaces.id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.role IN ('owner', 'admin')
  ));

CREATE POLICY workspace_owner_delete ON workspaces FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = workspaces.id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.role = 'owner'
  ));

-- Projects: all members can read; members can create/update; owner/admin can delete.
DROP POLICY IF EXISTS project_workspace_access ON projects;
CREATE POLICY project_member_read ON projects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = projects.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY project_editor_insert ON projects FOR INSERT
  WITH CHECK (
    created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM workspace_memberships m
      WHERE m.workspace_id = projects.workspace_id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND m.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY project_editor_update ON projects FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = projects.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.role IN ('owner', 'admin', 'member')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = projects.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.role IN ('owner', 'admin', 'member')
  ));

CREATE POLICY project_admin_delete ON projects FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = projects.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND m.role IN ('owner', 'admin')
  ));

-- Artifacts are versioned records: members may append versions, but no role
-- receives UPDATE or DELETE access. Corrections create a new version.
DROP POLICY IF EXISTS artifact_workspace_access ON project_artifacts;
CREATE POLICY artifact_member_read ON project_artifacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_artifacts.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY artifact_editor_insert ON project_artifacts FOR INSERT
  WITH CHECK (
    created_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM workspace_memberships m
      WHERE m.workspace_id = project_artifacts.workspace_id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND m.role IN ('owner', 'admin', 'member')
    )
  );

-- Activity is append-only. Members can read; editors can append events.
DROP POLICY IF EXISTS activity_workspace_access ON project_activity;
CREATE POLICY activity_member_read ON project_activity FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_activity.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY activity_editor_insert ON project_activity FOR INSERT
  WITH CHECK (
    (actor_id IS NULL OR actor_id = nullif(current_setting('app.user_id', true), '')::uuid)
    AND EXISTS (
      SELECT 1 FROM workspace_memberships m
      WHERE m.workspace_id = project_activity.workspace_id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND m.role IN ('owner', 'admin', 'member')
    )
  );

-- workspace_memberships deliberately remains self-readable and has no
-- client INSERT/UPDATE/DELETE policies. Membership administration requires
-- a separately reviewed, trusted onboarding/invitation path.
