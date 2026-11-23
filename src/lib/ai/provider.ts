export interface TextGenerationRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

export interface TextGenerationProvider {
  generate(request: TextGenerationRequest): Promise<string>;
}

export type AIProviderName = "openai" | "anthropic" | "gemini" | "openai-compatible";

export type ProviderConfig = {
  apiKey: string;
  model: string;
  endpoint: string;
};

type ProviderEnvironment = Record<string, string | undefined>;

function secureEndpoint(value: string, suffix: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value.endsWith("/") ? value : `${value}/`);
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}${suffix}`;
  } catch {
    throw new Error("AI provider endpoint must be a valid absolute URL.");
  }
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("AI provider endpoints must use HTTPS outside localhost.");
  }
  return endpoint.toString();
}

export function createProviderConfig(env: ProviderEnvironment = process.env): {
  provider: AIProviderName;
  config: ProviderConfig;
} {
  const provider = (env.AI_PROVIDER || "").trim() as AIProviderName;
  const allowed: AIProviderName[] = ["openai", "anthropic", "gemini", "openai-compatible"];
  if (!allowed.includes(provider)) {
    throw new Error("AI_PROVIDER must be openai, anthropic, gemini, or openai-compatible.");
  }
  const prefix = provider === "openai-compatible" ? "AI" : provider.toUpperCase();
  const apiKey = env[`${prefix}_API_KEY`]?.trim() || (provider === "openai-compatible" ? env.AI_API_KEY?.trim() : undefined);
  const model = env[`${prefix}_MODEL`]?.trim() || env.AI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error(`${prefix}_API_KEY and ${prefix}_MODEL (or AI_MODEL) are required.`);
  }
  const base = env[`${prefix}_BASE_URL`]?.trim() ||
    (provider === "openai" ? "https://api.openai.com/v1" :
      provider === "anthropic" ? "https://api.anthropic.com" :
        provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" :
          env.AI_BASE_URL?.trim() || "https://api.openai.com/v1");
  const suffix = provider === "anthropic" ? "/v1/messages" :
    provider === "gemini" ? `/models/${encodeURIComponent(model)}:generateContent` :
      "/chat/completions";
  return {
    provider,
    config: { apiKey, model, endpoint: secureEndpoint(base, suffix) },
  };
}

async function postJson(
  fetcher: typeof fetch,
  endpoint: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI provider request failed with HTTP ${response.status}.`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI provider timed out after 30 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AI provider returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

function nonEmptyText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AI provider returned empty content.");
  }
  return value.trim();
}

export class OpenAICompatibleProvider implements TextGenerationProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  async generate(request: TextGenerationRequest): Promise<string> {
    const payload = objectValue(await postJson(this.requestFetch, this.config.endpoint,
      { Authorization: `Bearer ${this.config.apiKey}` }, {
        model: this.config.model,
        temperature: 0.2,
        max_tokens: request.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }],
      }));
    const choices = payload.choices;
    if (!Array.isArray(choices) || !choices[0]) throw new Error("OpenAI-compatible response contained no completion.");
    const message = objectValue((choices[0] as Record<string, unknown>).message);
    return nonEmptyText(message.content);
  }
}

export class AnthropicProvider implements TextGenerationProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  async generate(request: TextGenerationRequest): Promise<string> {
    const payload = objectValue(await postJson(this.requestFetch, this.config.endpoint, {
      "x-api-key": this.config.apiKey,
      "anthropic-version": "2023-06-01",
    }, {
      model: this.config.model,
      max_tokens: request.maxOutputTokens,
      system: `${request.system} Return only a valid JSON object, with no markdown fences.`,
      messages: [{ role: "user", content: request.prompt }],
    }));
    if (!Array.isArray(payload.content)) throw new Error("Anthropic response contained no content blocks.");
    const text = payload.content
      .filter((block): block is Record<string, unknown> => !!block && typeof block === "object" && !Array.isArray(block))
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string).join("\n");
    return nonEmptyText(text);
  }
}

export class GeminiProvider implements TextGenerationProvider {
  constructor(
    private readonly config: ProviderConfig,
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  async generate(request: TextGenerationRequest): Promise<string> {
    const payload = objectValue(await postJson(this.requestFetch, this.config.endpoint, {
      "x-goog-api-key": this.config.apiKey,
    }, {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: request.maxOutputTokens,
        responseMimeType: "application/json",
      },
    }));
    const candidates = payload.candidates;
    if (!Array.isArray(candidates) || !candidates[0]) throw new Error("Gemini response contained no candidate.");
    const candidate = objectValue(candidates[0]);
    const content = objectValue(candidate.content);
    if (!Array.isArray(content.parts)) throw new Error("Gemini response contained no text parts.");
    const text = content.parts
      .filter((part): part is Record<string, unknown> => !!part && typeof part === "object" && !Array.isArray(part))
      .filter((part) => typeof part.text === "string")
      .map((part) => part.text as string).join("\n");
    return nonEmptyText(text);
  }
}

export function createConfiguredProvider(env: ProviderEnvironment = process.env): TextGenerationProvider {
  const { provider, config } = createProviderConfig(env);
  if (provider === "anthropic") return new AnthropicProvider(config);
  if (provider === "gemini") return new GeminiProvider(config);
  return new OpenAICompatibleProvider(config);
}
