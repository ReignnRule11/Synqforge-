import assert from "node:assert/strict";
import { PROJECT_ARTIFACT_TYPES, validateProjectArtifactInput } from "../src/lib/projects/artifacts";

const valid = validateProjectArtifactInput({
  artifact_type: "prd",
  title: "  Product requirements  ",
  content: { problem: "Fragmented workflows", successCriteria: ["Secure", "Auditable"] },
});
assert.equal(valid.title, "Product requirements");
assert.equal(valid.artifactType, "prd");
assert.equal(valid.content.problem, "Fragmented workflows");
assert.equal(PROJECT_ARTIFACT_TYPES.length, 10);

assert.throws(() => validateProjectArtifactInput(null), /JSON object/);
assert.throws(() => validateProjectArtifactInput({ artifact_type: "unknown", title: "Valid", content: {} }), /supported artifact_type/);
assert.throws(() => validateProjectArtifactInput({ artifact_type: "prd", title: "x", content: {} }), /2 and 160/);
assert.throws(() => validateProjectArtifactInput({ artifact_type: "prd", title: "Valid", content: [] }), /JSON object/);
assert.throws(
  () => validateProjectArtifactInput({ artifact_type: "prd", title: "Large", content: { body: "x".repeat(70 * 1024) } }),
  /64 KiB/,
);

console.log("PASS: artifact type, title, structured content, and payload-size validation.");
