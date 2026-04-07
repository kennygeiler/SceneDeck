# Testing Patterns

**Analysis Date:** 2026-04-07

## Test Framework

**Runner:**

- **Not configured** in the root Next.js app. Root `package.json` has no `test` script and no devDependencies for Vitest, Jest, Playwright, or Cypress.

**Assertion Library:**

- Not applicable for first-party tests (none present).

**Run Commands:**

```bash
pnpm lint          # Static analysis only (ESLint)
pnpm build         # Typecheck + Next production build (implicit TS check)
```

There is **no** `pnpm test` (or equivalent) at the repository root.

## Test File Organization

**Location:**

- No first-party `__tests__/` directories under `src/`.
- No `*.test.ts`, `*.test.tsx`, `*.spec.ts`, or `*.spec.tsx` files under `src/` or `worker/src/` (excluding `node_modules`).

**Naming:**

- When tests are added, prefer co-located or parallel naming consistent with common Next.js practice: `*.test.ts` / `*.test.tsx` next to source or under `src/__tests__/`.

**Structure:**

```
# Current state — no first-party test tree
src/
  (no test files)
worker/src/
  (no test files)
```

## Test Structure

**Suite Organization:**

- Not applicable — no example suites in-repo.

**Patterns to adopt (prescriptive for future work):**

- Prefer **Vitest** for unit tests (aligns with modern Next + TS ecosystems) or **Jest** if integrating with an existing org standard; add `vitest.config.ts` at repo root and a `test` script in `package.json`.
- For App Router route handlers, test handlers by importing exported functions where possible, or use `Request`/`Response` mocks; keep DB-dependent tests behind integration flags or test DB.

## Mocking

**Framework:**

- Not used in first-party code.

**Patterns:**

```typescript
// No in-repo examples — when adding tests, mock:
// - fetch / external HTTP (Gemini, OpenAI, etc.)
// - @neondatabase/serverless or drizzle layer for unit tests
```

**What to mock:**

- External APIs (`fetch` to Google Generative Language, OpenAI, Replicate, AWS SDK clients).
- Database when testing pure business logic in isolation.

**What NOT to mock:**

- Avoid mocking the module under test; prefer real implementations for small pure functions (e.g. display name helpers in `src/lib/shot-display.ts`).

## Fixtures and Factories

**Test data:**

- Seed and scripting data live in operational scripts (e.g. `src/db/` tooling referenced from `package.json`: `db:embeddings`, `corpus:ingest`) — these are **not** automated tests.

**Location for future tests:**

- Add `src/test-utils/` or colocated `fixtures/` only when introducing a test runner; keep factories typed from `src/db/schema.ts` / `src/lib/types.ts`.

## Coverage

**Requirements:** None enforced (no coverage config or CI gate).

**View Coverage:**

- Not applicable until a test runner and coverage provider (e.g. `@vitest/coverage-v8`) are added.

## Test Types

**Unit Tests:**

- Not present. High-value first targets: `src/lib/shot-display.ts`, taxonomy helpers in `src/lib/taxonomy.ts`, and pure parsing utilities under `src/components/agent/`.

**Integration Tests:**

- Not present. Would require test database URL, optional Docker/Neon branch, and careful isolation for `src/db/queries.ts`.

**E2E Tests:**

- **Not used.** No `playwright.config.*` or Cypress config at repo root. `.github/workflows` for CI is **not present** at the project root (only under dependencies in `node_modules`).

## Worker and Python

**Worker (`worker/`):**

- `worker/package.json` has no `test` script and no test dependencies. Type checking is via `pnpm build` → `tsc` inside `worker/`.

**Pipeline (`pipeline/`):**

- No `pytest.ini` or `tests/` directory detected; `requirements.txt` exists but no test runner usage was found in pipeline Python sources at analysis time.

## CI/CD

**Continuous integration:**

- No first-party GitHub Actions (or other) workflow files under `.github/workflows` at the repository root.

**Recommended minimum when CI is added:**

- `pnpm install` → `pnpm lint` → `pnpm build` for the Next app.
- Optionally `cd worker && npm install && npm run build` (worker uses npm per `AGENTS.md`, not pnpm workspace integration for install).

## Common Patterns

**Async Testing:**

- Not applicable until a framework is added; use `async/await` and `expect(await ...)` patterns standard to Vitest/Jest.

**Error Testing:**

- For route handlers, assert HTTP status and JSON body shape; for thrown configuration errors, assert message text in unit tests of small wrappers.

---

*Testing analysis: 2026-04-07*
