# PRD generation verification

This guide covers the authenticated PRD workflow after the consent-gated generation endpoint is configured. Automated CI uses deterministic provider fixtures and must never require live provider credentials.

## Preconditions

- Deploy the reviewed application build to a non-production environment.
- Configure exactly one provider using the server-side variables documented in [AI_GATEWAY.md](./AI_GATEWAY.md).
- Keep provider credentials out of browser-visible and `NEXT_PUBLIC_*` variables.
- Use a disposable workspace and project with synthetic, non-sensitive content.
- Confirm the selected provider and model shown by the endpoint match the environment configuration.

## Manual end-to-end checks

1. Sign in through GitHub OAuth and open a workspace.
2. Create a project with a synthetic name, description, target, and brief.
3. Open the project and confirm the configured provider and model are disclosed before consent.
4. Leave consent unchecked; confirm generation cannot be submitted.
5. Submit a request without consent directly to the API; expect HTTP 428 and confirm no provider request or artifact is created.
6. As an authenticated viewer, confirm the generation control is absent and a direct POST is rejected with HTTP 403.
7. As an owner, admin, or member, grant consent and generate a PRD. Expect HTTP 201 and a persisted `prd` artifact.
8. Confirm the generated artifact appears in project history with the next version number and a corresponding activity event.
9. Generate a second version and confirm the first version remains unchanged.
10. Revoke the test user's editor role while a deliberately delayed provider request is in flight; confirm the second authorization check rejects persistence.
11. Configure an invalid provider key in the test environment; confirm a provider failure returns HTTP 502 and does not create an artifact.
12. Configure a provider response that violates the PRD schema or artifact size limit; confirm it is rejected and nothing is persisted.

## Evidence to retain

For each run, record the application commit SHA, environment, provider/model identifier, test account role, HTTP status, artifact IDs/versions, activity event ID, and timestamp. Do not retain API keys, real learner/customer data, or full sensitive project briefs in test logs.

## Current verification boundary

The CI suite validates deterministic provider adapters and local route/domain behavior only. It does not prove that GitHub OAuth is configured correctly in a deployed environment, that a live provider accepts the selected model, or that the hosting environment has the required secrets and network access. Those checks require an explicitly authorized manual smoke test using synthetic data.
