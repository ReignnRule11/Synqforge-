# Provider-backed AI gateway

## Scope

The first Product Intelligence increment provides a server-only, provider-neutral text-generation interface and a strictly validated PRD output contract. It is a foundation, not yet a user-facing generation endpoint.

## Configuration

- `AI_PROVIDER=openai-compatible`
- `AI_API_KEY` — secret API credential
- `AI_MODEL` — explicit provider model identifier
- `AI_BASE_URL` — optional OpenAI-compatible API base URL; defaults to `https://api.openai.com/v1`

The provider is disabled unless all required configuration is present. Non-local endpoints must use HTTPS. The web runtime must keep credentials server-side. Never commit keys or log prompts, provider responses, or authorization headers.

## Generation and validation

`generatePrd` sends project input to the configured provider and requests a JSON object. The gateway parses the response and validates an exact, bounded schema before returning it. Unknown fields, missing lists, malformed JSON, empty output, provider errors, and timeouts fail the operation. No fallback content or fabricated AI result is produced.

The gateway marks assumptions and open questions separately and instructs the model not to claim interviews, market research, citations, metrics, or validation that were not supplied.

## Data handling and limitations

Calling this gateway sends the supplied project brief to the configured external AI provider. A future authenticated route must first verify project membership and editor role, disclose this data transfer, and persist output through the existing append-only artifact path only after successful schema validation. This increment does not add an API route, UI action, background job, or automatic artifact write.

## Verification

`npm run test:ai-gateway` uses deterministic test fixtures to verify contract acceptance, rejection of unexpected/missing fields, malformed provider output, and provider failure propagation. Fixtures are test-only; production generation always requires a configured provider.
