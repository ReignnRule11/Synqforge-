import assert from "node:assert/strict";
import { validateProjectInput } from "../src/lib/projects/domain";

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
console.log("PASS: project input normalization, bounds, and target allowlist.");
