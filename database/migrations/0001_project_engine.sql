-- SynqForge Project Engine foundation.
-- Apply with a migration runner after provisioning PostgreSQL.
-- The application must set app.user_id and app.workspace_id per transaction.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL CHECK (char_length(trim(name)) >= 2),
  slug VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_memberships (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_memberships_user_idx ON workspace_memberships(user_id);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL CHECK (char_length(trim(name)) >= 2),
  description VARCHAR(2000) NOT NULL DEFAULT '',
  target TEXT NOT NULL CHECK (target IN ('web', 'mobile', 'web_mobile')),
  status TEXT NOT NULL DEFAULT 'idea' CHECK (status IN (
    'idea', 'discovery', 'planning', 'design', 'architecture',
    'building', 'verification', 'launch', 'operations', 'archived'
  )),
  brief JSONB NOT NULL DEFAULT '{"problem":"","audience":"","proposedSolution":"","successCriteria":[],"constraints":[]}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, workspace_id)
);
CREATE INDEX projects_workspace_updated_idx ON projects(workspace_id, updated_at DESC);

CREATE TABLE project_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  project_id UUID NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'product_brief', 'prd', 'user_stories', 'roadmap', 'design_spec',
    'architecture', 'api_contract', 'database_schema', 'source_code', 'test_report'
  )),
  title VARCHAR(160) NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  content JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, workspace_id)
    REFERENCES projects(id, workspace_id) ON DELETE CASCADE,
  UNIQUE (project_id, artifact_type, version)
);
CREATE INDEX project_artifacts_history_idx
  ON project_artifacts(workspace_id, project_id, artifact_type, version DESC);

CREATE TABLE project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  project_id UUID,
  actor_id UUID,
  event_type TEXT NOT NULL,
  summary VARCHAR(500) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, workspace_id)
    REFERENCES projects(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX project_activity_timeline_idx
  ON project_activity(workspace_id, created_at DESC);

-- RLS is the final database boundary, not a replacement for API authorization.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_member_read ON workspaces FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = workspaces.id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY membership_self_read ON workspace_memberships FOR SELECT
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

CREATE POLICY project_workspace_access ON projects FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = projects.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = projects.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY artifact_workspace_access ON project_artifacts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_artifacts.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_artifacts.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY activity_workspace_access ON project_activity FOR ALL
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_activity.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_activity.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));
