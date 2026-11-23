# Engineering Roadmap

## Phase 0 — Repository and release foundation
- [x] Next.js + TypeScript application foundation and CI
- [x] Environment template, security guidance, and migration operations

## Phase 1 — SynqForge Core
- [x] Workspace/project relational model, lifecycle states, and activity ledger
- [x] Role-aware PostgreSQL RLS and tenant-isolation tests
- [x] Atomic workspace bootstrap and least-privilege runtime role
- [x] Transaction-scoped database identity and pooled connection isolation
- [x] Auth.js GitHub OAuth and verified server-session identity boundary
- [x] Checksum-verified migration runner with advisory locking
- [x] Authenticated workspace and project list/create APIs
- [x] Project detail retrieval and validated lifecycle transitions
- [x] Immutable versioned artifact APIs and append-only activity records
- [x] Project document history/editor experience
- [ ] Deployed browser-level end-to-end tests with live Auth.js and PostgreSQL

## Phase 2 — Product Intelligence
- [x] Multi-provider AI gateway (OpenAI, Anthropic, Gemini, OpenAI-compatible)
- [x] Strict PRD output validation and fail-closed provider behavior
- [x] Authenticated, consent-gated PRD generation endpoint
- [x] Immutable PRD artifact persistence and activity event in one transaction
- [x] Deterministic route-level authorization, consent, validation, and failure tests
- [ ] Live provider request and deployed end-to-end smoke test with synthetic data
- [ ] Discovery workflows, evidence-backed validation, personas, and assumption tracking
- [ ] Source attribution and uncertainty labels

## Phase 3 — Design and Architecture
- [ ] UX flow generation and editable design specifications
- [ ] Component system and design tokens
- [ ] Architecture decision records, database schema, and API contracts

## Phase 4 — Build Engine
- [ ] Scaffold generation and source artifact management
- [ ] Web build target first; Android/iOS target next
- [ ] Isolated build sandbox with resource, network, time, and filesystem restrictions
- [ ] Build logs, reproducible outputs, and reviewed diffs

## Phase 5 — Quality and Security
- [ ] Browser E2E, static analysis, dependency and secret scanning
- [ ] Bounded repair iterations with explicit diffs and approval gates

## Phase 6 — GitHub and Deploy
- [ ] Revocable GitHub repository integration with minimum scopes
- [ ] Repository creation/import, branch/commit/PR workflow
- [ ] Deployment adapters and status/log capture
- [ ] Human approval gates for public release

## Phase 7 — Persistent agents and lifecycle operations
- [ ] Queue-backed, cancellable jobs and task state
- [ ] Agent capabilities, policy, budgets, logs, and approvals
- [ ] Product monitoring, feedback analysis, and backlog recommendations

## Release gates
- Typecheck, lint, build, and capability-specific tests pass.
- No secrets or sensitive project data are exposed in logs.
- Cross-tenant access tests demonstrate isolation.
- Provider failures, timeouts, and invalid outputs fail closed.
- External integrations are described as unverified until tested against real provider state.
- Consequential actions require explicit human approval.
