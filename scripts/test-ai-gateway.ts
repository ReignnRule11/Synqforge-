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
  await new OpenAICompatibleProvider(config, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer secret-test");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, "model-test");
    assert.ok(Array.isArray(body.messages));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
  }).generate({ system: "system", prompt: "prompt", maxOutputTokens: 500 });

  await new AnthropicProvider(config, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("x-api-key"), "secret-test");
    assert.equal(new Headers(init?.headers).get("anthropic-version"), "2023-06-01");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, "model-test");
    assert.ok(Array.isArray(body.messages));
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(valid) }] }), { status: 200 });
  }).generate({ system: "system", prompt: "prompt", maxOutputTokens: 500 });

  await new GeminiProvider(config, async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "secret-test");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.ok(body.systemInstruction && body.generationConfig && body.contents);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(valid) }] } }] }), { status: 200 });
  }).generate({ system: "system", prompt: "prompt", maxOutputTokens: 500 });


  // Provider transport failures must be bounded, deterministic, and secret-safe.
  const networkFailure = new OpenAICompatibleProvider(config, async () => {
    throw new Error("request failed for Authorization: secret-test");
  });
  await assert.rejects(
    networkFailure.generate({ system: "system", prompt: "prompt", maxOutputTokens: 100 }),
    (error: unknown) => error instanceof Error &&
      error.message === "AI provider network request failed." &&
      !error.message.includes(config.apiKey),
  );

  const httpFailure = new OpenAICompatibleProvider(config, async () =>
    new Response("provider body may contain sensitive data", { status: 429 }),
  );
  await assert.rejects(
    httpFailure.generate({ system: "system", prompt: "prompt", maxOutputTokens: 100 }),
    (error: unknown) => error instanceof Error &&
      error.message === "AI provider request failed with HTTP 429." &&
      !error.message.includes("sensitive"),
  );

  const malformedProviderJson = new OpenAICompatibleProvider(config, async () =>
    new Response("{invalid-json", { status: 200, headers: { "Content-Type": "application/json" } }),
  );
  await assert.rejects(
    malformedProviderJson.generate({ system: "system", prompt: "prompt", maxOutputTokens: 100 }),
    /AI provider returned malformed JSON/,
  );

  const slowProvider = new OpenAICompatibleProvider(
    config,
    async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error("AbortSignal missing"));
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
    5,
  );
  await assert.rejects(
    slowProvider.generate({ system: "system", prompt: "prompt", maxOutputTokens: 100 }),
    /AI provider request timed out/,
  );

  console.log("AI gateway contract and multi-provider adapter tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
