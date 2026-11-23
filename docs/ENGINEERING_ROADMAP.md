# Engineering Roadmap

## Phase 0 — Repository & release foundation
- Next.js + TypeScript frontend, responsive shell, lint/typecheck/build CI
- Security, contribution, environment, and release practices
- Establish monorepo boundaries as backend/mobile become active

## Phase 1 — SynqForge Core
- Project/workspace model and lifecycle states
- User identity and access model
- Project intake form and structured idea brief
- Persistence and artifact versioning
- Product workspace and task/activity ledger

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
