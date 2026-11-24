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
assert.throws(() => validateProjectArtifactInput([]), /JSON object/);
assert.throws(() => validateProjectArtifactInput({ artifact_type: "unknown", title: "Valid", content: {} }), /supported artifact_type/);
assert.throws(() => validateProjectArtifactInput({ artifact_type: "prd", title: "x", content: {} }), /2 and 160/);
assert.throws(() => validateProjectArtifactInput({ artifact_type: "prd", title: "Valid", content: [] }), /JSON object/);
assert.throws(
  () => validateProjectArtifactInput({ artifact_type: "prd", title: "Large", content: { body: "x".repeat(70 * 1024) } }),
  /64 KiB/,
);
assert.throws(
  () => validateProjectArtifactInput({ artifact_type: "prd", title: "Unicode payload", content: { body: "é".repeat(33 * 1024) } }),
  /64 KiB/,
  "payload size must be measured in UTF-8 bytes, not JavaScript character count",
);

const cyclic: Record<string, unknown> = {};
cyclic.self = cyclic;
assert.throws(
  () => validateProjectArtifactInput({ artifact_type: "prd", title: "Cyclic payload", content: cyclic }),
  /valid JSON/,
);
assert.throws(
  () => validateProjectArtifactInput({ artifact_type: "prd", title: "BigInt payload", content: { count: BigInt(1) } }),
  /valid JSON/,
);

console.log("PASS: artifact type, title, JSON shape, UTF-8 byte limit, and serialization-failure validation.");
