import assert from "node:assert/strict";
import { validatePrdOutput } from "../src/lib/ai/contracts";
import { generatePrd } from "../src/lib/ai/gateway";
import { AnthropicProvider, createProviderConfig, GeminiProvider, OpenAICompatibleProvider, type ProviderConfig, type TextGenerationProvider } from "../src/lib/ai/provider";

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
  assert.equal(createProviderConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "oa-key", OPENAI_MODEL: "gpt-test" }).config.endpoint, "https://api.openai.com/v1/chat/completions");
  assert.equal(createProviderConfig({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "claude-key", ANTHROPIC_MODEL: "claude-test" }).config.endpoint, "https://api.anthropic.com/v1/messages");
  assert.equal(createProviderConfig({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "gem-key", GEMINI_MODEL: "gemini-test" }).config.endpoint, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  assert.throws(() => createProviderConfig({ AI_PROVIDER: "unknown", AI_API_KEY: "x", AI_MODEL: "x" }), /AI_PROVIDER must be/);
  assert.throws(() => createProviderConfig({ AI_PROVIDER: "anthropic", AI_API_KEY: "x", AI_MODEL: "x" }), /ANTHROPIC_API_KEY/);

  const config: ProviderConfig = { apiKey: "secret-test", model: "model-test", endpoint: "https://provider.example.test/api" };
  async function exercise(provider: TextGenerationProvider, expectedHeader: string, expectedBodyKey: string) {
    let seenHeaders: HeadersInit | undefined;
    let seenBody: Record<string, unknown> | undefined;
    const fakeFetch: typeof fetch = async (_input, init) => {
      seenHeaders = init?.headers;
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
    };
    await provider.generate({ system: "system", prompt: "prompt", maxOutputTokens: 500 });
    assert.ok(seenHeaders);
    assert.ok(new Headers(seenHeaders).has(expectedHeader));
    assert.ok(seenBody && expectedBodyKey in seenBody);
  }
  await exercise(new OpenAICompatibleProvider(config, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret-test");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, "model-test");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
  }), "authorization", "messages");
  await exercise(new AnthropicProvider(config, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("x-api-key"), "secret-test");
    assert.equal(new Headers(init?.headers).get("anthropic-version"), "2023-06-01");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, "model-test");
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(valid) }] }), { status: 200 });
  }), "x-api-key", "messages");
  await exercise(new GeminiProvider(config, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "secret-test");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.ok(body.systemInstruction && body.generationConfig);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(valid) }] } }] }), { status: 200 });
  }), "x-goog-api-key", "contents");

  console.log("AI gateway contract and multi-provider adapter tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
