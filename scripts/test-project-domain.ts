import assert from "node:assert/strict";
import { allowedProjectTransitions, canTransitionProject, isProjectStatus, validateProjectInput } from "../src/lib/projects/domain";

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
assert.deepEqual(allowedProjectTransitions("idea"), ["discovery", "archived"]);
assert.equal(canTransitionProject("idea", "discovery"), true);
assert.equal(canTransitionProject("idea", "building"), false);
assert.equal(canTransitionProject("archived", "idea"), true);
assert.equal(canTransitionProject("building", "building"), true);

console.log("PASS: project input validation and lifecycle transition rules.");
