import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { createProjectArtifactHandlers } from "../src/lib/projects/artifact-route";

const projectId = "123e4567-e89b-12d3-a456-426614174000";
const workspaceId = "223e4567-e89b-12d3-a456-426614174000";
const validBody = {
  artifact_type: "prd",
  title: "Release plan",
  content: { goals: ["ship safely"], metadata: { owner: "team" } },
};

function setup(options: { missingProject?: boolean; failActivityOnce?: boolean } = {}) {
  const artifacts: Array<Record<string, unknown>> = [];
  const idempotency = new Map<string, { request_hash: string; artifact_id: string }>();
  const activity: Array<Record<string, unknown>> = [];
  let nextId = 1;
  let failActivityOnce = options.failActivityOnce ?? false;
  let queue = Promise.resolve();

  const client = {
    async query(sql: string, values: unknown[] = []) {
      if (sql.includes("SELECT id FROM projects")) {
        return { rows: options.missingProject ? [] : [{ id: projectId }] };
      }
      if (sql.includes("SELECT workspace_id FROM projects")) {
        return { rows: options.missingProject ? [] : [{ workspace_id: workspaceId }] };
      }
      if (sql.includes("SELECT pg_advisory_xact_lock")) return { rows: [] };
      if (sql.includes("FROM project_artifact_idempotency")) {
        const key = String(values[2]);
        const record = idempotency.get(key);
        return { rows: record ? [record] : [] };
      }
      if (sql.includes("FROM project_artifacts") && sql.includes("ORDER BY")) {
        return { rows: artifacts };
      }
      if (sql.includes("FROM project_artifacts WHERE id = $1")) {
        const found = artifacts.find((item) => item.id === values[0]);
        return { rows: found ? [found] : [] };
      }
      if (sql.includes("SELECT COALESCE(MAX(version)")) {
        const type = values[1];
        const max = artifacts
          .filter((item) => item.project_id === projectId && item.artifact_type === type)
          .reduce((value, item) => Math.max(value, Number(item.version)), 0);
        return { rows: [{ next_version: max + 1 }] };
      }
      if (sql.includes("INSERT INTO project_artifacts")) {
        const artifact = {
          id: `artifact-${nextId++}`,
          workspace_id: values[0],
          project_id: values[1],
          artifact_type: values[2],
          title: values[3],
          version: values[4],
          content: JSON.parse(String(values[5])),
          created_by: "323e4567-e89b-12d3-a456-426614174000",
        };
        artifacts.push(artifact);
        return { rows: [artifact] };
      }
      if (sql.includes("INSERT INTO project_activity")) {
        if (failActivityOnce) {
          failActivityOnce = false;
          throw new Error("simulated activity write failure");
        }
        activity.push({ event_type: "artifact.version_created", metadata: JSON.parse(String(values[3])) });
        return { rows: [{ id: `activity-${activity.length}` }] };
      }
      if (sql.includes("INSERT INTO project_artifact_idempotency")) {
        idempotency.set(String(values[2]), { request_hash: String(values[3]), artifact_id: String(values[4]) });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in artifact route test: ${sql}`);
    },
  };

  async function withCurrentUserTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const artifactSnapshot = artifacts.slice();
      const activitySnapshot = activity.slice();
      const idempotencySnapshot = new Map(idempotency);
      try {
        return await work(client as unknown as PoolClient);
      } catch (error) {
        artifacts.splice(0, artifacts.length, ...artifactSnapshot);
        activity.splice(0, activity.length, ...activitySnapshot);
        idempotency.clear();
        for (const [key, value] of idempotencySnapshot) idempotency.set(key, value);
        throw error;
      }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    handlers: createProjectArtifactHandlers({ withCurrentUserTransaction }),
    artifacts,
    activity,
    idempotency,
  };
}

const context = { params: Promise.resolve({ projectId }) };
function post(body: unknown, key = "release-key-0001") {
  return new Request(`https://synqforge.test/api/projects/${projectId}/artifacts`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

async function main() {
  {
    const s = setup();
    const missingKey = new Request(`https://synqforge.test/api/projects/${projectId}/artifacts`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validBody),
    });
    assert.equal((await s.handlers.POST(missingKey, context)).status, 400);
    assert.equal((await s.handlers.POST(post(validBody, "bad key"), context)).status, 400);
    const wrongType = new Request(`https://synqforge.test/api/projects/${projectId}/artifacts`, {
      method: "POST", headers: { "content-type": "text/plain", "Idempotency-Key": "release-key-0001" }, body: "{}",
    });
    assert.equal((await s.handlers.POST(wrongType, context)).status, 415);
    assert.equal((await s.handlers.POST(post({ ...validBody, content: "not-object" }), context)).status, 422);
    assert.equal((await s.handlers.POST(post(validBody), { params: Promise.resolve({ projectId: "invalid" }) })).status, 422);
  }
  {
    const s = setup({ missingProject: true });
    assert.equal((await s.handlers.POST(post(validBody), context)).status, 404);
    assert.equal(s.artifacts.length, 0);
  }
  {
    const s = setup();
    const first = await s.handlers.POST(post(validBody), context);
    assert.equal(first.status, 201);
    const firstPayload = await first.json() as { artifact: { id: string; version: number }; idempotent_replay: boolean };
    assert.equal(firstPayload.idempotent_replay, false);
    assert.equal(firstPayload.artifact.version, 1);

    const replay = await s.handlers.POST(post({
      content: { metadata: { owner: "team" }, goals: ["ship safely"] },
      title: "Release plan",
      artifact_type: "prd",
    }), context);
    assert.equal(replay.status, 200);
    const replayPayload = await replay.json() as { artifact: { id: string }; idempotent_replay: boolean };
    assert.equal(replayPayload.idempotent_replay, true);
    assert.equal(replayPayload.artifact.id, firstPayload.artifact.id);
    assert.equal(s.artifacts.length, 1);
    assert.equal(s.activity.length, 1);

    const conflict = await s.handlers.POST(post({ ...validBody, title: "Changed title" }), context);
    assert.equal(conflict.status, 409);
    assert.equal(s.artifacts.length, 1);
    assert.equal(s.activity.length, 1);
  }
  {
    const s = setup();
    const responses = await Promise.all([
      s.handlers.POST(post(validBody, "parallel-key-0001"), context),
      s.handlers.POST(post(validBody, "parallel-key-0001"), context),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    assert.equal(s.artifacts.length, 1, "concurrent retries must create one artifact");
    assert.equal(s.activity.length, 1, "concurrent retries must append one activity event");
    assert.equal(s.idempotency.size, 1);
  }
  {
    const s = setup({ failActivityOnce: true });
    assert.equal((await s.handlers.POST(post(validBody, "retry-after-fail-01"), context)).status, 500);
    assert.equal(s.artifacts.length, 0);
    assert.equal(s.activity.length, 0);
    assert.equal(s.idempotency.size, 0);
    const retry = await s.handlers.POST(post(validBody, "retry-after-fail-01"), context);
    assert.equal(retry.status, 201, "a rolled-back request must be safely retryable with the same key");
    assert.equal(s.artifacts.length, 1);
    assert.equal(s.activity.length, 1);
    assert.equal(s.idempotency.size, 1);
  }
  {
    const s = setup();
    const response = await s.handlers.GET(new Request(`https://synqforge.test/api/projects/${projectId}/artifacts`), context);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { artifacts: [] });
  }

  console.log("PASS: artifact route HTTP contract covers validation, create, replay, payload conflict, concurrent retries, rollback/retry, and GET.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
