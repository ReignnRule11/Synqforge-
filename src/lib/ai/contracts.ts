export interface PrdOutput {
  title: string;
  summary: string;
  problem: string;
  targetUsers: string[];
  goals: string[];
  nonGoals: string[];
  userStories: string[];
  functionalRequirements: string[];
  acceptanceCriteria: string[];
  assumptions: string[];
  risks: string[];
  openQuestions: string[];
}

const ARRAY_FIELDS = [
  "targetUsers",
  "goals",
  "nonGoals",
  "userStories",
  "functionalRequirements",
  "acceptanceCriteria",
  "assumptions",
  "risks",
  "openQuestions",
] as const;

function boundedText(value: unknown, field: string, max = 2_000): string {
  if (typeof value !== "string") throw new Error(`AI output field "${field}" must be text.`);
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`AI output field "${field}" is empty or too long.`);
  return text;
}

function textList(value: unknown, field: string, maxItems = 20): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    throw new Error(`AI output field "${field}" must contain 1–${maxItems} items.`);
  }
  return value.map((item, index) => boundedText(item, `${field}[${index}]`, 1_000));
}

/** Validate untrusted model output before it can become a persisted project artifact. */
export function validatePrdOutput(value: unknown): PrdOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI provider returned a non-object PRD.");
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set(["title", "summary", "problem", ...ARRAY_FIELDS]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new Error("AI provider returned unexpected PRD fields.");
  }
  return {
    title: boundedText(input.title, "title", 160),
    summary: boundedText(input.summary, "summary"),
    problem: boundedText(input.problem, "problem"),
    targetUsers: textList(input.targetUsers, "targetUsers"),
    goals: textList(input.goals, "goals"),
    nonGoals: textList(input.nonGoals, "nonGoals"),
    userStories: textList(input.userStories, "userStories"),
    functionalRequirements: textList(input.functionalRequirements, "functionalRequirements"),
    acceptanceCriteria: textList(input.acceptanceCriteria, "acceptanceCriteria"),
    assumptions: textList(input.assumptions, "assumptions"),
    risks: textList(input.risks, "risks"),
    openQuestions: textList(input.openQuestions, "openQuestions"),
  };
}
