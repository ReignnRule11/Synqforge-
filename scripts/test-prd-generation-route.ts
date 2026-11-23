import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { createPrdGenerationHandlers, type PrdGenerationDependencies } from "../src/lib/projects/prd-generation";

const projectId = "123e4567-e89b-12d3-a456-426614174000";
const project = {
  id: projectId,
  workspace_id: "223e4567-e89b-12d3-a456-426614174000",
  name: "SynqForge",
  description: "Product lifecycle platform",
  target: "web",
  brief: { audience: "builders" },
};
const validPrd = {
  title: "SynqForge PRD",
  summary: "A product lifecycle workspace.",
  problem: "Product work is fragmented.",
  targetUsers: ["Product teams"],
  goals: ["Unify delivery"],
  nonGoals: ["Replace source control"],
  userStories: ["As a builder, I want a traceable workflow."],
  functionalRequirements: ["Projects retain versioned artifacts."],
  acceptanceCriteria: ["A saved PRD has an immutable version."],
  assumptions: ["Teams have GitHub accounts."],
  risks: ["Provider output may be incomplete."],
  openQuestions: ["Which integrations ship first?"],
};

type Scenario = {
  roles?: string[];
  missingProject?: boolean;
  unauthenticated?: boolean;
  providerFailure?: boolean;
  invalidPrd?: boolean;
  oversizedPrd?: boolean;
  activityFailure?: boolean;
  providerUnconfigured?: boolean;
};

function setup(scenario: Scenario = {}) {
  const sqlCalls: string[] = [];
  let transactions = 0;
  let providerCalls = 0;
  let artifactRows = 0;
  let activityRows = 0;
  let committedArtifacts = 0;
  let committedActivities = 0;
  const roles = scenario.roles ?? ["member", "member"];

  const client = {
    async query(sql: string) {
      sqlCalls.push(sql);
      if (sql.includes("SELECT p.id, p.workspace_id")) {
        return { rows: scenario.missingProject ? [] : [{ ...project, role: roles[0] ?? "member" }] };
      }
      if (sql.includes("SELECT p.workspace_id, m.role")) {
        return { rows: scenario.missingProject ? [] : [{ workspace_id: project.workspace_id, role: roles[1] ?? "member" }] };
      }
      if (sql.includes("SELECT m.role")) return { rows: [{ role: "member" }] };
      if (sql.includes("SELECT COALESCE(MAX(version)")) return { rows: [{ next_version: committedArtifacts + 1 }] };
      if (sql.includes("INSERT INTO project_artifacts")) {
        artifactRows += 1;
        return { rows: [{ id: "artifact-" + artifactRows, project_id: projectId, artifact_type: "prd", version: committedArtifacts + 1, content: validPrd }] };
      }
      if (sql.includes("INSERT INTO project_activity")) {
        if (scenario.activityFailure) throw new Error("activity insert failed");
        activityRows += 1;
        return { rows: [{ id: "activity-" + activityRows }] };
      }
      return { rows: [] };
    },
  };

  const dependencies: PrdGenerationDependencies = {
    async withCurrentUserTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
      if (scenario.unauthenticated) throw new Error("A verified session UUID is required.");
      transactions += 1;
      const artifactSnapshot = artifactRows;
      const activitySnapshot = activityRows;
      try {
        const result = await work(client as unknown as PoolClient);
        committedArtifacts = artifactRows;
        committedActivities = activityRows;
        return result;
      } catch (error) {
        artifactRows = artifactSnapshot;
        activityRows = activitySnapshot;
        throw error;
      }
    },
    createProviderConfig() {
      if (scenario.providerUnconfigured) throw new Error("provider config missing");
      return { provider: "openai", config: { model: "test-model" } };
    },
    async generatePrd(input) {
      providerCalls += 1;
      assert.equal(input.name, project.name);
      if (scenario.providerFailure) throw new Error("provider unavailable");
      if (scenario.invalidPrd) return { ...validPrd, unexpected: "rejected" } as never;
      if (scenario.oversizedPrd) return { ...validPrd, ...Object.fromEntries(["targetUsers", "goals", "nonGoals", "userStories", "functionalRequirements", "acceptanceCriteria", "assumptions", "risks", "openQuestions"].map((field) => [field, Array.from({ length: 20 }, () => "x".repeat(1000))])) } as never;
      return validPrd;
    },
  };

  return {
    handlers: createPrdGenerationHandlers(dependencies),
    sqlCalls,
    get transactions() { return transactions; },
    get providerCalls() { return providerCalls; },
    get artifactRows() { return artifactRows; },
    get activityRows() { return activityRows; },
    get committedArtifacts() { return committedArtifacts; },
    get committedActivities() { return committedActivities; },
  };
}

const context = { params: Promise.resolve({ projectId }) };
const request = (body: string, contentType = "application/json") => new Request(
  "https://synqforge.test/api/projects/" + projectId + "/generate-prd",
  { method: "POST", headers: { "content-type": contentType }, body },
);
const consent = () => request(JSON.stringify({ consent: true }));

async function main() {
  {
    const s = setup();
    const response = await s.handlers.POST(request(JSON.stringify({ consent: false })), context);
    assert.equal(response.status, 428);
    assert.equal(s.transactions, 0);
    assert.equal(s.providerCalls, 0);
  }
  {
    const s = setup();
    assert.equal((await s.handlers.POST(request("{"), context)).status, 400);
    assert.equal((await s.handlers.POST(request("{}", "text/plain"), context)).status, 415);
    assert.equal((await s.handlers.POST(request(JSON.stringify({ consent: true, userId: "forged" })), context)).status, 428);
  }
  {
    const s = setup();
    const invalid = await s.handlers.POST(request(JSON.stringify({ consent: true })), { params: Promise.resolve({ projectId: "bad" }) });
    assert.equal(invalid.status, 422);
  }
  {
    const s = setup({ unauthenticated: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 401);
    assert.equal(s.providerCalls, 0);
  }
  {
    const s = setup({ roles: ["viewer"] });
    assert.equal((await s.handlers.POST(consent(), context)).status, 403);
    assert.equal(s.providerCalls, 0);
  }
  {
    const s = setup({ missingProject: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 404);
    assert.equal(s.providerCalls, 0);
  }
  {
    const s = setup({ providerUnconfigured: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 503);
    assert.equal(s.providerCalls, 0);
  }
  {
    const s = setup({ providerFailure: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 502);
    assert.equal(s.artifactRows, 0);
  }
  {
    const s = setup({ invalidPrd: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 502);
    assert.equal(s.artifactRows, 0);
  }
  {
    const s = setup({ oversizedPrd: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 502);
    assert.equal(s.artifactRows, 0);
  }
  {
    const s = setup({ roles: ["member", "viewer"] });
    assert.equal((await s.handlers.POST(consent(), context)).status, 403);
    assert.equal(s.artifactRows, 0);
  }
  {
    const s = setup();
    const response = await s.handlers.POST(consent(), context);
    assert.equal(response.status, 201);
    const payload = await response.json() as { artifact: { version: number }; provider: string };
    assert.equal(payload.artifact.version, 1);
    assert.equal(payload.provider, "openai");
    assert.equal(s.committedArtifacts, 1);
    assert.equal(s.committedActivities, 1);
    assert.match(s.sqlCalls.find((sql) => sql.includes("FOR UPDATE OF p")) ?? "", /FOR UPDATE OF p/);
    assert.ok(s.sqlCalls.some((sql) => sql.includes("pg_advisory_xact_lock")), "version allocation must be serialized");
  }
  {
    const s = setup({ activityFailure: true });
    assert.equal((await s.handlers.POST(consent(), context)).status, 500);
    assert.equal(s.committedArtifacts, 0);
    assert.equal(s.committedActivities, 0);
  }
  {
    const s = setup();
    const response = await s.handlers.GET(new Request("https://synqforge.test"), context);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { provider: "openai", model: "test-model" });
  }
  {
    const s = setup({ unauthenticated: true });
    assert.equal((await s.handlers.GET(new Request("https://synqforge.test"), context)).status, 401);
  }

  console.log("PASS: PRD route tests cover consent, authentication, roles, revocation, provider failures, validation, and atomic append behavior.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
