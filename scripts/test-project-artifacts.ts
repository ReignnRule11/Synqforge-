import assert from "node:assert/strict";
import { PROJECT_ARTIFACT_TYPES, validateProjectArtifactInput } from "../src/lib/projects/artifacts";
import { hashArtifactRequest, validateIdempotencyKey } from "../src/lib/projects/artifact-idempotency";

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

const canonicalInputA = validateProjectArtifactInput({
  artifact_type: "prd",
  title: "Canonical PRD",
  content: { z: 1, nested: { b: true, a: "same" }, a: [1, 2] },
});
const canonicalInputB = validateProjectArtifactInput({
  content: { a: [1, 2], nested: { a: "same", b: true }, z: 1 },
  title: "Canonical PRD",
  artifact_type: "prd",
});
assert.equal(hashArtifactRequest(canonicalInputA), hashArtifactRequest(canonicalInputB),
  "object property order must not change the idempotency request hash");
assert.notEqual(
  hashArtifactRequest(canonicalInputA),
  hashArtifactRequest({ ...canonicalInputA, content: { ...canonicalInputA.content, z: 2 } }),
  "a changed payload must produce a different request hash",
);
assert.equal(validateIdempotencyKey("request-1234"), "request-1234");
for (const invalidKey of [null, "", "short", "bad key value", "x".repeat(129)]) {
  assert.throws(() => validateIdempotencyKey(invalidKey), /Idempotency-Key/);
}

console.log("PASS: artifact validation, UTF-8 limits, canonical request hashing, and idempotency-key validation.");
