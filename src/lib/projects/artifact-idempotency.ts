import { createHash } from "node:crypto";

export interface ArtifactIdempotencyInput {
  artifactType: string;
  title: string;
  content: Record<string, unknown>;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** Validate a caller-supplied key before it is used in database lock/lookup scope. */
export function validateIdempotencyKey(value: string | null): string {
  if (!value || !IDEMPOTENCY_KEY_PATTERN.test(value)) {
    throw new Error("Idempotency-Key must contain 8 to 128 letters, numbers, dots, underscores, colons, or hyphens.");
  }
  return value;
}

/** Canonical JSON makes semantically identical object key order hash to the same request. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function hashArtifactRequest(input: ArtifactIdempotencyInput): string {
  const canonical = canonicalJson({
    artifact_type: input.artifactType,
    title: input.title,
    content: input.content,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
