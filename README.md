# SynqForge

[![SynqForge CI](https://github.com/ReignnRule11/Synqforge-/actions/workflows/ci.yml/badge.svg)](https://github.com/ReignnRule11/Synqforge-/actions/workflows/ci.yml)

**From idea to industry.** SynqForge is a product creation and lifecycle workspace designed to help founders move from an idea toward validated plans, architecture, implementation, and deployment.

## Implemented foundation

- Auth.js v5 GitHub OAuth with JWT sessions and server-verified identity.
- PostgreSQL workspace and project data model with tenant isolation and role-aware row-level security.
- Restricted application database role, transaction-scoped identity, and checksum-verified migration runner.
- Authenticated workspace bootstrap, listing, and project list/create APIs.
- Project detail retrieval and validated lifecycle transitions.
- Immutable, versioned project artifacts with append-only activity records.
- Provider-backed PRD generation through OpenAI, Anthropic Claude, Gemini, or an OpenAI-compatible endpoint.
- Explicit consent before project brief data is sent to the selected external AI provider.
- Automated unit, route-boundary, and PostgreSQL security tests in GitHub Actions.

## Current PRD-generation flow

An authenticated project editor can inspect the configured provider/model, explicitly consent to external processing, and request a first-draft PRD. The server checks membership and role before provider invocation, validates the generated output, rechecks access before persistence, and appends the immutable artifact and activity event in one database transaction. Provider failure or invalid output does not create an artifact.

Generated PRDs are drafts and require human review. Provider credentials remain server-side. Automatic provider failover is disabled.

## Verification and deployment status

CI validates deterministic provider adapters, route authorization/consent behavior, schema and artifact limits, transaction behavior, and PostgreSQL RLS/least-privilege boundaries. These tests do **not** prove that a live deployment has valid GitHub OAuth credentials, a provisioned database, working provider credentials, or successful external API connectivity.

Live OAuth and provider smoke tests remain outstanding and must be run in a non-production environment with synthetic project data. The repository does not itself provide hosted infrastructure or production credentials.

## Local development

Requirements: Node.js 20+, npm, and PostgreSQL for database-backed workflows.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and configure the required server-side values. See:

- [Authentication](docs/AUTHENTICATION.md)
- [Database operations and migrations](docs/DATABASE_OPERATIONS.md)
- [AI gateway and provider configuration](docs/AI_GATEWAY.md)
- [PRD generation verification runbook](docs/PRD_GENERATION_VERIFICATION.md)
- [Engineering roadmap](docs/ENGINEERING_ROADMAP.md)

Never commit credentials or expose them through `NEXT_PUBLIC_*` variables. Use a restricted runtime database login for `DATABASE_URL`; reserve `MIGRATION_DATABASE_URL` for controlled migration execution.
