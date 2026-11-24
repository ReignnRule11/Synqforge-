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
- [x] Strict TypeScript, ESLint, and production-build gates in CI
- [x] Deterministic regression coverage for authentication, workspace/project domains, artifacts, AI gateway, and PRD route boundaries
- [x] Extended regression cases for workspace Unicode/slug boundaries, lifecycle graph integrity, immutable transitions, and artifact UTF-8/serialization limits
- [x] CodeQL static analysis and high-severity npm dependency audit
- [x] Deployment-triggered Chromium smoke checks for sign-in reachability and unauthenticated workspace API rejection
- [ ] Authenticated cross-tenant browser verification using two dedicated test identities and a live project
- [x] CI secret scanning via Gitleaks on pull requests, main pushes, and a weekly schedule
- [ ] Enable and verify GitHub native secret-scanning alerts and push protection
- [ ] Bounded repair iterations with explicit diffs and approval gates
- [x] Dependency Review workflow verified successfully on PR #32
- [x] V8 coverage instrumentation with text/LCOV reports for AI, auth, project, and workspace domain modules; CI publishes a seven-day report artifact
- [x] Current-user transaction orchestration extracted behind a dependency seam and tested for verified identity, invalid sessions, auth failure, and database failure
- [ ] Establish and enforce defensible global/per-file coverage thresholds from repeated CI baselines
- [x] Live PostgreSQL runtime tests verify transaction-local role/identity, rollback behavior, and pooled-connection identity reset across tenant reuse
- [x] AI provider resilience tests cover network rejection, HTTP errors, malformed response JSON, abort timeouts, and secret-safe transport errors
- [x] PostgreSQL artifact integrity tests cover failed-write rollback, concurrent version allocation across separate pooled connections, and one-to-one artifact/activity event consistency
- [x] Artifact creation uses workspace/project-scoped idempotency keys, canonical payload hashes, atomic persistence, and replay/conflict semantics
- [x] Live PostgreSQL integration covers verified-session-to-runtime adapter composition, transaction-local identity, and RLS enforcement using a deterministic session fixture
- [ ] Production-like deployed GitHub OAuth and authenticated browser verification with dedicated test identities

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
