# Testing Patterns

**Analysis Date:** 2026-04-11

## Test Framework

**Runner:**

- **Vitest** `^3.2.4` (devDependency in root `package.json`).
- Config: `vitest.config.ts`.

**Assertion library:**

- Vitest exposes **`expect`** compatible with Jest-style matchers.

**Environment:**

- **`environment: "node"`** — unit tests run in Node, not `jsdom`.

**Include pattern:**

- Tests are discovered with `include: ["src/**/*.test.ts"]` (files under `src/lib/__tests__/*.test.ts` match this glob).

**Path aliases in tests:**

- `@` resolves to `./src` (same as TypeScript paths), so tests could use `@/...` imports; current tests mostly use **relative** imports to the sibling module (`../ingest-pipeline`, etc.).

## Run Commands

```bash
pnpm test              # vitest run — non-watch, used in CI
pnpm exec vitest       # default Vitest CLI (watch mode when interactive TTY)
```

**Coverage:**

- No enforced coverage threshold or dedicated `pnpm` script detected in root `package.json`. Add coverage via Vitest config/CLI if needed.

## Test File Organization

**Location:**

- All automated TypeScript unit tests live under **`src/lib/__tests__/`**.

**Naming:**

- **`*.test.ts`** suffix (required by `vitest.config.ts` `include`).

**Layout:**

```
src/lib/__tests__/
├── archive-trust.test.ts
├── boundary-cut-merge.test.ts
├── boundary-cut-preset.test.ts
├── boundary-eval.test.ts
├── boundary-fusion.test.ts
├── classify-parallelism.test.ts
├── classification-sanitize.test.ts
├── eval-cut-json.test.ts
├── gemini-json-extract.test.ts
├── ingest-error-sanitize.test.ts
├── ingest-timeline-window.test.ts
├── ingest-worker-origin.test.ts
├── server-log.test.ts
└── viz-shot-map.test.ts
```

**Scope:**

- Tests target **pure logic and helpers** in `src/lib/` (boundary merge/fusion/eval, Gemini JSON extraction, ingest sanitization, server logging, viz mapping, etc.).
- **No** Vitest suites under `worker/` or `src/app/` at time of analysis; worker correctness is enforced by **`pnpm check:worker`** (TypeScript only).

## Test Structure

**Suite organization:**

- Wrap cases in **`describe`**, individual cases in **`it`**.
- Import `describe`, `expect`, `it` from **`vitest`**; add `beforeEach`, `afterEach`, `vi` when needed.

**Example (minimal):**

```typescript
import { describe, expect, it } from "vitest";

import { extractFirstJsonObject } from "../gemini-json-extract";

describe("extractFirstJsonObject", () => {
  it("extracts first object when trailing prose exists", () => {
    const raw = `Here you go: {"a":1,"b":"x"} thanks`;
    expect(extractFirstJsonObject(raw)).toBe('{"a":1,"b":"x"}');
  });
});
```

**Example (env lifecycle):**

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("mergeInteriorCutSec", () => {
  const prev = process.env.METROVISION_BOUNDARY_MERGE_GAP_SEC;

  beforeEach(() => {
    process.env.METROVISION_BOUNDARY_MERGE_GAP_SEC = "0.35";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.METROVISION_BOUNDARY_MERGE_GAP_SEC;
    else process.env.METROVISION_BOUNDARY_MERGE_GAP_SEC = prev;
  });

  it("merges nearby duplicates from base and extras", () => {
    // ...
  });
});
```

**Example (Vitest env stubs):**

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveGeminiClassifyParallelism", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("respects METROVISION_CLASSIFY_CONCURRENCY", () => {
    vi.stubEnv("METROVISION_CLASSIFY_CONCURRENCY", "10");
    expect(resolveGeminiClassifyParallelism(5)).toBe(10);
  });
});
```

## Mocking

**Framework:**

- Vitest **`vi`** API (`vi.spyOn`, `vi.stubEnv`, `vi.unstubAllEnvs`, `vi.restoreAllMocks`).

**Patterns:**

- **`vi.spyOn(console, "error").mockImplementation(() => {})`** to assert structured log output without printing (`src/lib/__tests__/server-log.test.ts`).
- Use **`afterEach` → `vi.restoreAllMocks()`** or **`vi.unstubAllEnvs()`** to avoid leaking mocks between tests.

**What to mock:**

- Console methods when asserting log payloads.
- Environment variables via **`vi.stubEnv`** for code that reads `process.env`.

**What not to mock (current style):**

- Prefer testing **pure functions** and small helpers without mocking the database or network unless adding dedicated integration tests (none in current Vitest suite).

## Fixtures and Factories

**Test data:**

- Prefer **inline literals** in `it` blocks for small inputs (strings, arrays of cut times, JSON snippets).

**Eval smoke fixtures:**

- **`scripts/eval-smoke.ts`** reads **`eval/gold/smoke.json`** and **`eval/predicted/smoke.json`** for a CI boundary check (not a Vitest file, but part of the quality gate).

## CI/CD Testing Steps

### `.github/workflows/ci.yml` (main CI)

**Triggers:** `push` and `pull_request` to `main` or `master`.

**Job `verify` (ubuntu-latest, Node 20, pnpm 9):**

1. `pnpm install --frozen-lockfile`
2. **`pnpm lint`** — ESLint (root app; `worker/**` and `pipeline/**` excluded in `eslint.config.mjs`)
3. **`pnpm check:taxonomy`** — `tsx scripts/check-taxonomy-parity.ts` (TS vs Python taxonomy)
4. **`pnpm check:schema-drift`** — `tsx scripts/check-schema-drift.ts`
5. **`pnpm test`** — **`vitest run`**
6. **`pnpm eval:smoke`** — `tsx scripts/eval-smoke.ts` (boundary F1 smoke on in-repo gold/predicted JSON; **exits 1** on mismatch)
7. **`pnpm build`** — Next production build with placeholder env:
   - `DATABASE_URL: postgresql://ci:ci@127.0.0.1:5432/ci`
   - `NEXT_PUBLIC_SITE_URL: https://metrovision.vercel.app`
8. **`pnpm check:worker`** — `tsc --noEmit -p worker/tsconfig.json`

### `.github/workflows/taxonomy-parity.yml`

**Triggers:** `push` / `pull_request` when paths change under:

- `src/lib/taxonomy.ts`
- `pipeline/taxonomy.py`
- `scripts/check-taxonomy-parity.ts`

**Steps:** checkout → pnpm setup → `pnpm install --frozen-lockfile` → **`pnpm check:taxonomy`** only.

## Test Types

**Unit tests (Vitest):**

- Fast, deterministic, no real DB or external APIs in the current suite.

**Integration / E2E:**

- **Not detected** in CI (no Playwright/Cypress workflow steps).

**Type-level checks:**

- **`pnpm check:worker`** complements tests for the worker package.

**Smoke eval:**

- **`pnpm eval:smoke`** validates boundary evaluation logic against tiny committed JSON artifacts.

## Adding New Tests

1. Add **`src/lib/<feature>.ts`** (or extend an existing module).
2. Create **`src/lib/__tests__/<feature>.test.ts`** (or a name matching the module under test).
3. Use **`pnpm test`** locally; ensure **`pnpm lint`** still passes.
4. If behavior affects taxonomy, run **`pnpm check:taxonomy`**; if it affects shared schema expectations used by ingest checks, **`pnpm check:schema-drift`**.

---

*Testing analysis: 2026-04-11*
