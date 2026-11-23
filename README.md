# SynqForge

**From idea to industry.** SynqForge is an autonomous product creation and lifecycle platform designed to help founders turn ideas into validated product plans, architecture, real applications, tests, and deployments from one workspace.

## Product direction

- Idea intake and product intelligence
- Evidence-backed discovery, validation, and requirements
- Editable PRDs, user stories, milestones, and product artifacts
- UX and design-system planning
- Architecture, database, and API design
- Real application code generation across web and mobile targets
- Sandboxed builds, tests, and quality gates
- GitHub integration and controlled deployments
- Persistent agents with transparent tasks, approvals, and logs

## Development principles

- Real implementations over mock functionality
- Explicitly label demo data and unconnected integrations
- Human approval for consequential actions
- Security, tenant isolation, and portability by default
- Inspectable, editable, exportable artifacts
- Mobile-first usability and cost-aware infrastructure

## Current status

The repository contains a responsive Next.js foundation and an initial Project Engine domain/schema. The Project Engine migration is not yet applied to a live database. Authentication, runtime persistence, project API routes, AI, build sandbox, GitHub automation, and deployment orchestration are not connected until implemented and verified.

## Local development

Requirements: Node.js 20+, npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Project Engine schema

Review [the data model and security contract](docs/PROJECT_ENGINE_DATA_MODEL.md). The initial PostgreSQL migration is at `database/migrations/0001_project_engine.sql`.

Do not expose project APIs until a verified authentication session, transaction-scoped workspace authorization, and a non-BYPASSRLS runtime database role are configured.
