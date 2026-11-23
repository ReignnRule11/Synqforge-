export const PROJECT_ARTIFACT_TYPES = [
  "product_brief",
  "prd",
  "user_stories",
  "roadmap",
  "design_spec",
  "architecture",
  "api_contract",
  "database_schema",
  "source_code",
  "test_report",
] as const;

export type ProjectArtifactType = (typeof PROJECT_ARTIFACT_TYPES)[number];

export interface ProjectArtifactInput {
  artifactType: ProjectArtifactType;
  title: string;
  content: Record<string, unknown>;
}

const MAX_ARTIFACT_BYTES = 64 * 1024;

export function validateProjectArtifactInput(input: unknown): ProjectArtifactInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Artifact input must be a JSON object.");
  }
  const value = input as Record<string, unknown>;
  if (typeof value.artifact_type !== "string" ||
      !(PROJECT_ARTIFACT_TYPES as readonly string[]).includes(value.artifact_type)) {
    throw new Error("A supported artifact_type is required.");
  }
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (title.length < 2 || title.length > 160) {
    throw new Error("Artifact title must be between 2 and 160 characters.");
  }
  if (!value.content || typeof value.content !== "object" || Array.isArray(value.content)) {
    throw new Error("Artifact content must be a JSON object.");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value.content);
  } catch {
    throw new Error("Artifact content must be valid JSON.");
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_ARTIFACT_BYTES) {
    throw new Error("Artifact content must not exceed 64 KiB.");
  }
  return {
    artifactType: value.artifact_type as ProjectArtifactType,
    title,
    content: value.content as Record<string, unknown>,
  };
}
