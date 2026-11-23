import "server-only";
import { validatePrdOutput, type PrdOutput } from "./contracts";
import { OpenAICompatibleProvider, type TextGenerationProvider } from "./provider";

const PRD_SYSTEM_PROMPT = `You are a senior product manager. Produce a rigorous, evidence-conscious product requirements document. Return only a JSON object with exactly these keys: title, summary, problem, targetUsers, goals, nonGoals, userStories, functionalRequirements, acceptanceCriteria, assumptions, risks, openQuestions. Every list must contain at least one concise string. Distinguish user-provided facts from assumptions. Do not invent market research, customer interviews, metrics, citations, or validation results. Put unknowns in openQuestions. Use measurable acceptance criteria where the brief supports them; otherwise state what must be measured.`;

export async function generatePrd(
  brief: { name: string; description: string; target: string; brief: unknown },
  provider: TextGenerationProvider = new OpenAICompatibleProvider(),
): Promise<PrdOutput> {
  const prompt = JSON.stringify({
    instruction: "Create a first-draft PRD from this project input. Do not claim validation has occurred.",
    project: brief,
  });
  const raw = await provider.generate({
    system: PRD_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 3_500,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI provider returned malformed JSON; no artifact was created.");
  }
  return validatePrdOutput(parsed);
}
