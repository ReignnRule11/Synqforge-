# Multi-provider AI gateway

## Supported providers

The server-side gateway supports native API adapters for OpenAI, Anthropic Claude, and Google Gemini, plus a generic OpenAI-compatible endpoint.

Configure one provider per request process using `AI_PROVIDER`:

- `openai`: `OPENAI_API_KEY`, `OPENAI_MODEL`, optional `OPENAI_BASE_URL`.
- `anthropic`: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, optional `ANTHROPIC_BASE_URL`.
- `gemini`: `GEMINI_API_KEY`, `GEMINI_MODEL`, optional `GEMINI_BASE_URL`.
- `openai-compatible`: `AI_API_KEY`, `AI_MODEL`, optional `AI_BASE_URL`.

`AI_MODEL` can supply a shared model fallback. Provider-specific keys and model values take precedence. Never expose provider credentials through `NEXT_PUBLIC_*` variables.

## Transport and safeguards

- OpenAI-compatible endpoints use Bearer authentication and Chat Completions JSON mode.
- Anthropic uses the Messages API and its provider-specific authentication/version headers.
- Gemini uses `generateContent` with JSON response mode.
- Non-local endpoints must use HTTPS.
- Requests have a 30-second timeout and bounded response parsing.
- Provider HTTP errors, malformed responses, empty output, invalid JSON, schema violations, and missing credentials fail closed.
- No automatic provider failover or fabricated fallback output is enabled.

The shared PRD validator is authoritative even when a provider offers structured-output features.

## Data handling and consent

The authenticated `POST /api/projects/{projectId}/generate-prd` route requires explicit `{ "consent": true }`. Before provider invocation, it verifies the Auth.js session, project membership, and an owner/admin/member role. It loads the project name, description, target, and brief from the database; client-supplied identity, role, or project brief is not accepted.

The selected external provider receives that project content to generate the PRD. The configured provider/model is disclosed through the authenticated GET route before consent. Access is checked again after the network call; revoked or downgraded access prevents persistence. A validated result is appended as an immutable PRD artifact with an activity event in the same database transaction.

The generated PRD is an unverified first draft and must be reviewed. Do not send sensitive or production data during smoke tests; use synthetic project content.

## Verification

- `npm run test:ai-gateway` exercises provider selection/configuration, request headers and payloads, malformed output, and provider failure using local fixtures.
- `npm run test:prd-generation-route` exercises HTTP consent, authorization, provider failure, validation, and persistence boundaries with deterministic fixtures.
- PostgreSQL CI exercises RLS and least-privilege database boundaries.

These tests do not make live paid provider requests and do not prove deployed OAuth/provider connectivity. Follow [PRD_GENERATION_VERIFICATION.md](PRD_GENERATION_VERIFICATION.md) for the manual staging smoke test.
