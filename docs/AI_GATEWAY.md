# Multi-provider AI gateway

## Supported providers

The server-side gateway supports native API adapters for OpenAI, Anthropic Claude, and Google Gemini, plus a generic OpenAI-compatible endpoint for compatible services.

Configure one provider per request process using `AI_PROVIDER`:

- `openai`: `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_BASE_URL`.
- `anthropic`: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, optional `ANTHROPIC_BASE_URL`.
- `gemini`: `GEMINI_API_KEY`, `GEMINI_MODEL`, optional `GEMINI_BASE_URL`.
- `openai-compatible`: `AI_API_KEY`, `AI_MODEL`, optional `AI_BASE_URL`.

For any provider, `AI_MODEL` can supply a shared model fallback. Provider-specific keys and model values take precedence. Do not configure multiple keys in a client environment or expose them through `NEXT_PUBLIC_*`.

Defaults:
- OpenAI: `https://api.openai.com/v1`
- Anthropic: `https://api.anthropic.com`
- Gemini: `https://generativelanguage.googleapis.com/v1beta`
- OpenAI-compatible: `https://api.openai.com/v1`

Non-local endpoints must use HTTPS. The selected model identifier is explicit configuration; model availability and structured-output support vary by provider/model.

## Provider-specific transport

- OpenAI-compatible endpoints use Bearer authentication and Chat Completions JSON mode.
- Anthropic uses the Messages API, `x-api-key`, and `anthropic-version`; the model is instructed to return JSON.
- Gemini uses `generateContent`, `x-goog-api-key`, and `responseMimeType: application/json`.

Each adapter normalizes provider response content to text. The shared PRD validator remains authoritative; provider-native structured output does not replace application validation.

## Fail-closed behavior

Each request has a 30-second timeout. HTTP errors, malformed provider responses, empty output, invalid JSON, schema violations, and missing credentials fail the generation. There is no implicit provider fallback or fabricated response. Provider selection is explicit; automatic failover is intentionally not enabled because it could move project data to a different external processor without user consent.

## Data handling and limitations

Sending a project brief to a provider transmits that content to the configured external service. A future authenticated route must authorize project membership and editor role before provider invocation, disclose the selected provider, and append only validated output. This gateway does not yet add a user-facing generation endpoint or automatic artifact write.

## Verification

`npm run test:ai-gateway` tests shared PRD validation, provider selection/configuration, native request headers and payload shapes, malformed output, and provider failure propagation using deterministic local fixtures. It does not make live paid API calls.


## Authenticated PRD generation

The authenticated `POST /api/projects/{projectId}/generate-prd` route requires explicit `{ consent: true }` request consent. Before provider invocation it verifies the Auth.js session, project membership, and an owner/admin/member role. It sends the project name, description, target, and brief to the configured provider only after consent. The response is validated against the strict PRD contract and 64 KiB artifact limit, then appended as an immutable version with an activity event in the same database transaction. Access is checked again after the provider call; revoked access prevents persistence. The companion `GET` route discloses the configured provider and model to authenticated project members before consent.

Sending a project brief transmits that content to the configured external service. The generated PRD is an unverified first draft and must be reviewed. No automatic provider failover is enabled.
