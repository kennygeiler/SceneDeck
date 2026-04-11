# Coding Conventions

**Analysis Date:** 2026-04-11

## Naming Patterns

**Files:**

- Use **kebab-case** for file names (e.g. `film-browser.tsx`, `boundary-cut-preset.ts`, `metadata-overlay.tsx`). Aligns with `AGENTS.md`.
- Route segments follow App Router conventions; public marketing/browse routes live under the `(site)` route group in `src/app/(site)/`.

**Functions and variables:**

- Use **camelCase** for functions, methods, and variables.

**React components:**

- Use **PascalCase** for component names and their defining functions (e.g. `FilmBrowser`, `BrowsePage`).

**Types:**

- Use **PascalCase** for types and interfaces (e.g. `BrowsePageProps`, `ShotSizeSlug`).
- Prefer `type` for object shapes where the codebase already does; import taxonomy slugs as types from `src/lib/taxonomy.ts`.

**Constants / enums:**

- Taxonomy and shared slugs live as constants in `src/lib/taxonomy.ts` (TypeScript) and must stay in sync with `pipeline/taxonomy.py` (run `pnpm check:taxonomy`).

## Framework and UI (AGENTS.md alignment)

**Next.js App Router:**

- Use the **App Router only** (no Pages Router).
- Prefer **Server Components** for data fetching; add `"use client"` only when the file needs browser-only APIs or interactive state.
- Do **not** call `buttonVariants()` from `@/components/ui/button` inside Server Components — that module is client-only. Extract a small client child or use plain `className` strings.

**Styling:**

- Use **Tailwind CSS 4** utility classes. Design tokens live in `src/styles/tokens.css` (OKLCH, dark cinematic theme).
- Base UI primitives live under `src/components/ui/` (shadcn-style, Radix underneath).

**Data and display:**

- Import the Drizzle client only from `src/db/index.ts` as `db` (AC-04). Prefer the query builder: `db.select().from().where()`.
- For human-readable taxonomy labels, use `src/lib/shot-display.ts` — avoid duplicating display-name maps elsewhere.

## Code Style

**Formatting:**

- No repository-root **Prettier** config detected; rely on ESLint-driven consistency and team/editor defaults.

**Linting:**

- Root ESLint uses the **flat config** in `eslint.config.mjs`.
- Extends `next/core-web-vitals` and `next/typescript` via `@eslint/eslintrc` `FlatCompat`.
- **Ignored paths** (not linted by root ESLint): `.next/`, `out/`, `build/`, `next-env.d.ts`, `.claude/`, `.cursor/`, `.planning/`, `.kiln/`, **`worker/**`**, **`pipeline/**`**. The Express worker is type-checked separately (`pnpm check:worker`).

**TypeScript:**

- Root `tsconfig.json`: **`strict`: true**, `noEmit`: true, `moduleResolution`: `"bundler"`, `jsx`: `"preserve"` for Next.
- Root TypeScript **`exclude`** includes `worker` — the worker uses `worker/tsconfig.json` for its own compile scope.

**Run lint:**

```bash
pnpm lint
```

## Import Organization

**Observed pattern (app and tests):**

1. **Node built-ins** — use the `node:` prefix where used (e.g. `import path from "node:path"` in `scripts/eval-smoke.ts`).
2. **External packages** — e.g. `next`, `vitest`.
3. **Blank line** between dependency groups.
4. **Internal imports** — either `@/...` (preferred in `src/app` and `src/components`) or **relative** `../` from tests in `src/lib/__tests__/` to the module under test.

**Path aliases:**

- `@/*` maps to `./src/*` in `tsconfig.json`. Vitest mirrors this in `vitest.config.ts` (`resolve.alias`).

**Example (Server Component page):** `src/app/(site)/browse/page.tsx` — `next` / types first, then `@/components/...`, `@/db/queries`, `@/lib/...`.

## Error Handling

**API routes (`src/app/api/**/route.ts`):**

- Validate input early; return **JSON error bodies** with appropriate **HTTP status** (400 for bad input, 401/403 when gated, 500 for unexpected failures).
- Use **`NextResponse.json`** or **`Response.json`** consistently within a route; many handlers wrap logic in `try/catch` and map errors to a stable `{ error: string }` shape (see e.g. `src/app/api/eval/artifacts/route.ts`).
- Prefer small helpers for repeated error messages (e.g. `evalArtifactDbErrorMessage` in eval artifact routes).

**Ingest / LLM routes:**

- Rate-limit external model calls with `acquireToken()` from `src/lib/rate-limiter.ts` before Gemini (or equivalent) HTTP usage — required by AC-07 (`AGENTS.md`).

**Client vs server:**

- Do not leak secrets or raw upstream HTML bodies to clients; sanitization helpers live in modules such as `src/lib/ingest-error-sanitize.ts` (covered by unit tests).

## Logging

**Structured server logging:**

- Use `logServerEvent` from `src/lib/server-log.ts` for JSON lines with `level`, `event`, `service`, and optional fields (see `src/lib/__tests__/server-log.test.ts`).

**Search / DB:**

- `searchShots` and related DB code may log with a **`[searchShots]`** prefix — keep that convention when extending query code (`AGENTS.md`).

## Comments

**When to comment:**

- Use comments for non-obvious invariants, pipeline/env semantics, and constraint references (e.g. AC-XX). Avoid restating what the code already says.

**Top-of-file / script headers:**

- Long-running or CI scripts may include a short module doc (e.g. `scripts/eval-smoke.ts`).

**JSDoc / TSDoc:**

- Not required project-wide; use where it clarifies public library APIs or tricky generics.

## Function and Module Design

**Size:**

- Prefer focused functions; very large route files should still keep validation, orchestration, and side effects visually separable.

**Parameters:**

- Use explicit options objects for complex call sites (common in ingest and boundary detection).

**Exports:**

- Colocate feature code under `src/components/<domain>/`, `src/lib/`, `src/db/`. No mandatory barrel files; import from the defining module.

**Worker package:**

- `worker/` is ESM (`"type": "module"` in `worker/package.json`). It imports shared app code from `../../src/lib/*` at runtime via `tsx` — keep shared modules worker-safe (no accidental Next-only imports).

## Python pipeline (brief)

- Mirror taxonomy in `pipeline/taxonomy.py` with `src/lib/taxonomy.ts`.
- Rate-limit Gemini usage in Python as in TS (AC-07).

---

*Convention analysis: 2026-04-11*
