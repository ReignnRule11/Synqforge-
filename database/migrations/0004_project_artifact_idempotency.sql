-- Durable idempotency for immutable project artifact creation.
-- One key is scoped to a workspace, project, and operation. Its record and artifact
-- are committed in the same transaction; project deletion removes both.

ALTER TABLE project_artifacts
  ADD CONSTRAINT project_artifacts_id_project_workspace_unique
  UNIQUE (id, project_id, workspace_id);

CREATE TABLE project_artifact_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  project_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'artifact.create'),
  idempotency_key VARCHAR(128) NOT NULL
    CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request_hash CHAR(64) NOT NULL
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  artifact_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_artifact_idempotency_scope_unique
    UNIQUE (workspace_id, project_id, operation, idempotency_key),
  CONSTRAINT project_artifact_idempotency_project_fk
    FOREIGN KEY (project_id, workspace_id)
    REFERENCES projects(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT project_artifact_idempotency_artifact_fk
    FOREIGN KEY (artifact_id, project_id, workspace_id)
    REFERENCES project_artifacts(id, project_id, workspace_id) ON DELETE CASCADE
);

CREATE INDEX project_artifact_idempotency_artifact_idx
  ON project_artifact_idempotency(artifact_id);

ALTER TABLE project_artifact_idempotency ENABLE ROW LEVEL SECURITY;

CREATE POLICY artifact_idempotency_member_read
  ON project_artifact_idempotency FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_memberships m
    WHERE m.workspace_id = project_artifact_idempotency.workspace_id
      AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  ));

CREATE POLICY artifact_idempotency_editor_insert
  ON project_artifact_idempotency FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_memberships m
      WHERE m.workspace_id = project_artifact_idempotency.workspace_id
        AND m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
        AND m.role IN ('owner', 'admin', 'member')
    )
  );

GRANT SELECT, INSERT ON project_artifact_idempotency TO synqforge_app;
