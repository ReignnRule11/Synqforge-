# Coverage policy

SynqForge measures V8 coverage for the application logic under `src/lib/ai`,
`src/lib/auth`, `src/lib/projects`, and `src/lib/workspaces`. The same
coverage command is used locally and in the required CI validation job.

## Enforced floors

| Scope | Lines | Statements | Functions | Branches |
|---|---:|---:|---:|---:|
| Global | 95% | 95% | 95% | 80% |
| Each included file | 95% | 95% | 90% | 65% |

Both global and per-file checks must pass. These are minimums, not targets for
reducing existing coverage. New tests should preserve or improve the current
baseline, especially around authorization, tenant isolation, persistence, and
provider failure paths.

## Baseline evidence

The thresholds were selected from six successful `main` CI coverage runs
available on 2026-11-24. Metrics are statements / branches / functions / lines.

| Main commit (short SHA) | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| `f23162f` | 97.94% | 81.23% | 98.50% | 97.94% |
| `12802e7` | 97.94% | 81.23% | 98.50% | 97.94% |
| `6914458` | 98.27% | 83.56% | 98.23% | 98.27% |
| `47e22f1` | 98.27% | 83.56% | 98.23% | 98.27% |
| `1660a33` | 98.24% | 82.39% | 98.23% | 98.24% |
| `1a2db19` | 95.34% | 82.11% | 97.19% | 95.34% |

The global floors are deliberately below the lowest observed successful run:
95% for statements/lines, 80% for branches, and 95% for functions. This
provides a small regression margin without pretending the baseline is 100%.

The lowest per-file values in the latest main report were 96.21% lines for
`projects/artifact-route.ts`, 66.66% branches for that route, and 92%
functions for `ai/provider.ts`. Per-file floors of 95% lines/statements,
65% branches, and 90% functions are therefore evidence-based and leave a
narrow margin for legitimate future code paths. They prevent a highly covered
module from masking a poorly covered included module.

## Scope and exclusions

- `src/lib/auth/authenticated-db.ts` is explicitly excluded from V8
  instrumentation. It is a thin server-only composition entrypoint around
  Auth.js and the tested current-user transaction factory. The factory and
  verified-session-to-PostgreSQL composition are covered by unit and live
  PostgreSQL integration tests respectively. This exclusion must not be
  expanded to the underlying authentication boundary or transaction logic.
- Type declarations (`*.d.ts`) are excluded because they contain no
  executable runtime statements.
- The thresholds apply only to the configured include paths. New critical
  runtime modules should be added to the coverage include list when introduced.
- Coverage is not a substitute for live PostgreSQL, deployed OAuth, browser
  cross-tenant, or security tests. Those remain separate release gates.

## CI behavior

`npm run test:coverage` runs the deterministic unit suite, then checks global
floors and each-file floors. A coverage regression fails the command and
therefore fails the CI validation job. CI retains the text and LCOV report
artifact for seven days for inspection.

Threshold changes require updated baseline evidence and review. Do not lower
floors merely to make a failing change pass; add meaningful tests or document
a justified scope change.
