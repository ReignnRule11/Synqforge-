import assert from "node:assert/strict";
import {
  allowedProjectTransitions,
  canTransitionProject,
  isProjectStatus,
  PROJECT_STATUSES,
  transitionProject,
  validateProjectInput,
  type Project,
  type ProjectStatus,
} from "../src/lib/projects/domain";

assert.deepEqual(
  validateProjectInput({ name: "  SynqForge  ", description: " Product platform ", target: "web_mobile" }),
  { name: "SynqForge", description: "Product platform", target: "web_mobile" },
);

for (const name of ["", "x", " ".repeat(3), "x".repeat(81)]) {
  assert.throws(() => validateProjectInput({ name, target: "web" }));
}
assert.throws(() => validateProjectInput({ name: "Valid name", description: "x".repeat(2001), target: "web" }));
for (const target of ["desktop", "WEB", null, 1, undefined]) {
  assert.throws(() => validateProjectInput({ name: "Valid name", target }));
}
assert.equal(isProjectStatus("idea"), true);
assert.equal(isProjectStatus("unknown"), false);
assert.equal(isProjectStatus(null), false);
assert.equal(isProjectStatus(1), false);
assert.deepEqual(allowedProjectTransitions("idea"), ["discovery", "archived"]);
assert.equal(canTransitionProject("idea", "discovery"), true);
assert.equal(canTransitionProject("idea", "building"), false);
assert.equal(canTransitionProject("archived", "idea"), true);
assert.equal(canTransitionProject("building", "building"), true);

// Every declared lifecycle state must have a defined, duplicate-free transition list.
for (const status of PROJECT_STATUSES) {
  const transitions = allowedProjectTransitions(status);
  assert.equal(new Set(transitions).size, transitions.length, `duplicate transition from ${status}`);
  for (const next of transitions) {
    assert.equal(canTransitionProject(status, next), true, `${status} -> ${next} must be allowed`);
  }
  assert.equal(canTransitionProject(status, status), true, `${status} must allow an idempotent transition`);
}

const original: Project = {
  id: "project-1",
  workspaceId: "workspace-1",
  name: "Regression project",
  description: "",
  target: "web",
  status: "idea",
  brief: { problem: "", audience: "", proposedSolution: "", successCriteria: [], constraints: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const transitioned = transitionProject(original, "discovery");
assert.equal(transitioned.status, "discovery");
assert.notEqual(transitioned.updatedAt, original.updatedAt);
assert.ok(Number.isFinite(Date.parse(transitioned.updatedAt)));
assert.equal(original.status, "idea", "transition must not mutate the input project");
assert.equal(original.updatedAt, "2026-01-01T00:00:00.000Z", "transition must preserve the original timestamp");
assert.throws(() => transitionProject(original, "launch" as ProjectStatus), /Invalid project transition/);

console.log("PASS: project input validation, lifecycle graph integrity, idempotency, and immutable transition behavior.");
