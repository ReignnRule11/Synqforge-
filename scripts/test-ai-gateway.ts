import assert from "node:assert/strict";
import { validatePrdOutput } from "../src/lib/ai/contracts";
import { generatePrd } from "../src/lib/ai/gateway";
import type { TextGenerationProvider } from "../src/lib/ai/provider";

const valid = {
  title: "Learning platform PRD",
  summary: "A first draft for a focused learning product.",
  problem: "Learners struggle to identify knowledge gaps.",
  targetUsers: ["Independent learners"],
  goals: ["Help learners identify gaps"],
  nonGoals: ["Replace qualified teachers"],
  userStories: ["As a learner, I want a baseline assessment."],
  functionalRequirements: ["The system records assessment responses."],
  acceptanceCriteria: ["A completed assessment produces a saved result."],
  assumptions: ["Learners have intermittent internet access."],
  risks: ["Insufficient baseline data"],
  openQuestions: ["Which subjects are in the first release?"],
};

class FixtureProvider implements TextGenerationProvider {
  constructor(private readonly output: string) {}
  async generate() { return this.output; }
}

async function main() {
  assert.deepEqual(validatePrdOutput(valid), valid);
  assert.throws(() => validatePrdOutput({ ...valid, surprise: "fabricated" }), /unexpected PRD fields/);
  assert.throws(() => validatePrdOutput({ ...valid, goals: [] }), /must contain/);
  assert.throws(() => validatePrdOutput({ ...valid, title: "" }), /empty or too long/);

  const generated = await generatePrd(
    { name: "Example", description: "Example input", target: "web", brief: {} },
    new FixtureProvider(JSON.stringify(valid)),
  );
  assert.equal(generated.title, valid.title);

  await assert.rejects(
    () => generatePrd(
      { name: "Example", description: "Example input", target: "web", brief: {} },
      new FixtureProvider("not json"),
    ),
    /malformed JSON; no artifact was created/,
  );

  const failingProvider: TextGenerationProvider = {
    async generate() { throw new Error("provider unavailable"); },
  };
  await assert.rejects(
    () => generatePrd({ name: "Example", description: "Example input", target: "web", brief: {} }, failingProvider),
    /provider unavailable/,
  );
  console.log("AI gateway contract tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
