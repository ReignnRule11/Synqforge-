export interface TextGenerationRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

export interface TextGenerationProvider {
  generate(request: TextGenerationRequest): Promise<string>;
}

type ProviderConfig = {
  apiKey: string;
  model: string;
  endpoint: string;
};

function readConfig(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  if (env.AI_PROVIDER !== "openai-compatible") {
    throw new Error("AI provider is not configured. Set AI_PROVIDER=openai-compatible.");
  }
  const apiKey = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new Error("AI_API_KEY and AI_MODEL are required for provider-backed generation.");
  }
  const baseUrl = env.AI_BASE_URL?.trim() || "https://api.openai.com/v1";
  let endpoint: URL;
  try {
    endpoint = new URL("/chat/completions", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  } catch {
    throw new Error("AI_BASE_URL must be a valid absolute URL.");
  }
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "localhost" && endpoint.hostname !== "127.0.0.1") {
    throw new Error("AI_BASE_URL must use HTTPS outside localhost.");
  }
  return { apiKey, model, endpoint: endpoint.toString() };
}

export class OpenAICompatibleProvider implements TextGenerationProvider {
  constructor(
    private readonly config = readConfig(),
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  async generate(request: TextGenerationRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.requestFetch(this.config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          temperature: 0.2,
          max_tokens: request.maxOutputTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`AI provider request failed with HTTP ${response.status}.`);
      }
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") throw new Error("AI provider returned an invalid response.");
      const choices = (payload as { choices?: unknown }).choices;
      if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
        throw new Error("AI provider response did not contain a completion.");
      }
      const message = (choices[0] as { message?: { content?: unknown } }).message;
      if (typeof message?.content !== "string" || !message.content.trim()) {
        throw new Error("AI provider returned empty content.");
      }
      return message.content;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AI provider timed out after 30 seconds.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
