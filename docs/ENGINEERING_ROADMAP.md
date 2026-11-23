# Engineering Roadmap

## Phase 0 — Repository & release foundation
- Next.js + TypeScript frontend, responsive shell, lint/typecheck/build CI
- Security, contribution, environment, and release practices
- Establish monorepo boundaries as backend/mobile become active

## Phase 1 — SynqForge Core
- [x] Project/workspace relational model and lifecycle states
- [x] User membership and tenant isolation schema
- [x] Project intake domain validation
- [x] Artifact versioning and activity ledger schema
- [x] Role-aware RLS policies
- [x] Non-owner runtime role and atomic workspace bootstrap
- [x] PostgreSQL permission and bootstrap CI tests
- [x] Transaction-scoped runtime adapter and pooled identity isolation tests
- [x] Dedicated non-owner runtime login and least-privilege integration tests
- [x] Authentication/session provider and secure workspace onboarding
- [ ] Migration runner and operational database configuration
- [x] Authenticated workspace and project list/create API handlers with role-aware authorization
- [x] Persistent project listing and creation UI scoped to the selected workspace
- [x] Project input validation and PostgreSQL role/tenant isolation tests
- [x] Persistent project UI and API integration surface for project detail and lifecycle updates
- [x] Lifecycle transition domain validation and role-aware PostgreSQL update/activity tests
- [x] Versioned project artifact API with immutable append-only document versions
- [x] Project document history and editor UI for briefs, PRDs, stories, roadmaps, architecture, and other artifact types
- [x] Artifact validation, version allocation, and role/tenant isolation PostgreSQL tests
- [ ] Browser-level end-to-end tests against a live Auth.js and PostgreSQL environment

## Phase 2 — Product Intelligence
- Provider-agnostic AI gateway with strict typed outputs
- Discovery, personas, problem framing, assumptions, validation plan
- PRD, stories, acceptance criteria, roadmap artifacts
- Sources and uncertainty labels

## Phase 3 — Design & Architecture
- UX flow generation and editable design specification
- Component system and design tokens
- Architecture decision records, database schema, API contracts

## Phase 4 — Build Engine
- Scaffold generation and source file artifact management
- Web build target first; Android/iOS Expo/RN target next
- Isolated sandbox with resource, network, time, and filesystem restrictions
- Build logs, reproducible outputs, and user-reviewed diffs

## Phase 5 — Quality & Security
- Unit/integration/e2e checks, lint, type checks, static analysis
- Security scanning and secret detection
- Repair iterations with bounded retry and explicit change diffs

## Phase 6 — GitHub & Deploy
- OAuth with minimum scopes and revocable connection
- Repository creation/import, branch/commit/PR workflow
- Deployment adapters and status/log capture
- Manual approval gates for public release

## Phase 7 — Persistent agents & lifecycle operations
- Queue-backed, cancellable jobs and task state
- Agent capabilities, policy, tool registry, budgets, logs
- Product monitoring, feedback analysis, backlog recommendations
- Controlled continuous improvement with approval gates

## Release gates
- Typecheck, lint, and build must pass
- Automated tests must pass for changed capabilities
- Secrets and sensitive data must not be exposed in logs
- No tenant data leakage in cross-workspace access tests
- AI provider failures and timeouts handled predictably
- Demo-only features are visibly marked
- Deployment and integrations verified against actual provider state
