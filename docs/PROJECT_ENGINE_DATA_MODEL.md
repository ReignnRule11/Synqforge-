# Project Engine — data model and security contract

## Scope

Migrations `0001_project_engine.sql` through `0003_secure_workspace_bootstrap.sql` establish workspaces, memberships, projects, versioned artifacts, activity, role-aware RLS, runtime grants, and atomic workspace bootstrap.

## Database security

Row-level security is enabled on application tables. Transactions must set transaction-local `app.user_id` from a verified server session. Never accept it from request bodies, query parameters, browser storage, or mobile clients.

Migration `0003` defines the restricted `synqforge_app` role. The application runtime login must be a separate non-owner, non-superuser, non-`BYPASSRLS` login with membership in `synqforge_app`. Migration credentials are not runtime credentials.

## Runtime login contract

The PostgreSQL CI job provisions `synqforge_test_runtime` as a separate login, grants it membership in `synqforge_app`, and uses that login for adapter tests. It verifies that the runtime login cannot own public objects, create roles/databases, bypass RLS, or directly mutate workspace memberships. It also exercises pooled tenant identity isolation and secure workspace bootstrap.

The CI password is disposable and exists only inside the ephemeral PostgreSQL service. Production runtime credentials must be provisioned separately, stored in server-side secret management, and never shipped to client apps.

## Secure workspace bootstrap

`public.create_workspace(name, slug)` accepts no user ID. It reads transaction-local identity, validates the inputs, and inserts the workspace and owner membership atomically. It is SECURITY DEFINER with a fixed search path, revoked from PUBLIC, and executable only by `synqforge_app`.

## Authentication and API gate

The transaction adapter is not authentication. The server must verify an auth session/token before it passes the identity UUID to the adapter. Workspace/project routes remain gated until session verification, role-aware authorization, runtime credentials, and integration tests are in place.

## Current coverage

- PostgreSQL-backed RLS/role permission tests
- Dedicated non-owner runtime login with limited role inheritance
- Pooled transaction-local tenant identity isolation
- Workspace bootstrap creates owner membership
- Invalid UUID rejected
- Direct membership write denied to runtime login

Remaining gates: auth/session provider, migration runner, authenticated workspace/project APIs, persistent UI, and API-level tests.
