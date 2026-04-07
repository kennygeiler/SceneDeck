# Coding Conventions

**Analysis Date:** 2026-04-07

## Naming Patterns

**Files:**

- React components and pages: **kebab-case** filenames (e.g. `film-card.tsx`, `chat-interface.tsx`, `metadata-overlay.tsx`) under `src/components/` and `src/app/`.
- Library and server modules: **kebab-case** (e.g. `agent-tools.ts`, `shot-display.ts`, `load-env.ts`) under `src/lib/` and `src/db/`.
- Python pipeline modules: **snake_case** filenames (e.g. `main.py`, `classify.py`) under `pipeline/`.
- Worker (Express) TypeScript: **kebab-case** or descriptive single names under `worker/src/` (e.g. `server.ts`, `ingest.ts`).

**Functions:**

- Use **camelCase** for functions and variables (e.g. `getAllFilms`, `renderMarkdown`, `toGeminiContents`).
- React components are **PascalCase** named exports (e.g. `export function FilmCard` in `src/components/films/film-card.tsx`).

**Variables:**

- **camelCase** for locals and parameters; **UPPER_SNAKE** only where conventional for env-backed constants (not required project-wide).

**Types:**

- **PascalCase** for types and interfaces (e.g. `FilmCardProps`, `ChatMessage`, `RequestBody` in `src/app/api/agent/chat/route.ts`).
- Prefer `type` for object shapes and props; use `interface` where the codebase already does for clarity or extension.

## Code Style

**Formatting:**

- No committed **Prettier** config at repo root (`.prettierrc*` not present). Style is enforced primarily by **ESLint** and team consistency.
- TypeScript **strict mode** is enabled in both `tsconfig.json` (Next app) and `worker/tsconfig.json`.

**Linting:**

- **ESLint 9** flat config in `eslint.config.mjs`.
- Extends `next/core-web-vitals` and `next/typescript` via `@eslint/eslintrc` `FlatCompat`.
- Global ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
- Run: `pnpm lint` (maps to `eslint` in root `package.json`).

**TypeScript compiler:**

- App: `tsconfig.json` — `strict: true`, `moduleResolution: "bundler"`, `jsx: "preserve"`, Next plugin, `noEmit: true`.
- Worker: `worker/tsconfig.json` — `strict: true`, `outDir: "dist"`, `rootDir: "src"`, emits JS for Node.

## Import Organization

**Order (typical in this codebase):**

1. Next.js or Node built-ins (e.g. `import Image from "next/image"`).
2. Blank line.
3. Internal imports via `@/` alias (`@/db/queries`, `@/components/...`, `@/lib/...`).

**Path aliases:**

- `@/*` → `./src/*` (see `tsconfig.json`). Matches shadcn aliases in `components.json`: `components`, `utils`, `ui`, `lib`, `hooks` → `@/components`, `@/lib/utils`, etc.

**Type-only imports:**

- Use `import type { ... }` when importing only types (e.g. `src/components/films/film-card.tsx`).

## Error Handling

**Patterns:**

- **Fail fast on missing configuration:** throw `Error` when required env is absent (e.g. `src/db/index.ts` for `DATABASE_URL`; `callGemini` in `src/app/api/agent/chat/route.ts` for `GOOGLE_API_KEY`).
- **Route handlers:** wrap `POST`/`GET` in `try/catch`; return `Response.json({ error }, { status })` for client errors (400) and opaque or generic messages for 500 where appropriate.
- **Streaming / SSE:** errors inside the stream use `console.error` and send structured `{ type: "error", text }` events before `done` (see `src/app/api/agent/chat/route.ts`).
- **Non-fatal sub-operations:** empty `catch` blocks with a comment when failure must not abort the main flow (e.g. RAG retrieval in the same route).

**eslint and `any`:**

- Prefer typed shapes; when interacting with loosely typed external JSON, use narrow casts or `Record<string, unknown>`. If `any` is unavoidable, use a targeted disable: `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (as in `src/app/api/agent/chat/route.ts`).

## Logging

**Framework:** Node/`console` only (no dedicated logging library detected in root `package.json`).

**Patterns:**

- `console.error` for operational errors in API routes and stream handlers.
- Do not log secrets or full request bodies containing credentials.

## Comments

**When to comment:**

- File-level or section banners for domain modules (e.g. block comments at top of `src/lib/taxonomy.ts`).
- Large client components sometimes use ASCII section dividers (e.g. `src/components/agent/chat-interface.tsx`).
- Explain **why** for non-obvious control flow (e.g. non-fatal RAG failure, streaming behavior).

**JSDoc/TSDoc:**

- JSDoc-style blocks used for helper functions where the contract is non-obvious (e.g. `toGeminiContents`, `callGemini` in `src/app/api/agent/chat/route.ts`). Not required on every exported symbol.

## Function Design

**Size:**

- Prefer focused functions; long route handlers may use nested helpers (same file) to keep streaming logic readable.

**Parameters:**

- Object parameters for structured input (`Request`, destructured body types).

**Return values:**

- App Router handlers return `Response` or `Response.json`.
- Query/helpers return typed data or `null` for missing rows where appropriate.

## Module Design

**Exports:**

- Named exports for components (`export function FilmCard`) and utilities; default exports appear where Next.js or config expects them (`next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`).

**Barrel files:**

- No heavy `index.ts` barrel pattern required; import from concrete paths (`@/components/films/film-card`).

## Next.js App Router Conventions

- **Server Components** by default for pages in `src/app/(site)/` that fetch data (e.g. `src/app/(site)/page.tsx` importing `getAllFilms` from `@/db/queries`).
- **Client Components:** first statement `"use client";` then React imports (e.g. `src/components/agent/chat-interface.tsx`).
- **Route segments:** API routes under `src/app/api/**/route.ts`; use `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` when needed (see `src/app/api/agent/chat/route.ts`). Note: in that file, route config exports precede imports — valid but unusual; new files may follow standard import-first order unless there is a documented reason.

## Styling

- **Tailwind CSS 4** with PostCSS plugin `@tailwindcss/postcss` (`postcss.config.mjs`).
- Global tokens and theme: `src/styles/globals.css` (per `components.json`), design tokens in `src/styles/tokens.css` (referenced in project docs).
- Use `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge) for conditional classes.

## Python (pipeline)

- Dependencies in `pipeline/requirements.txt`; entry via `python main.py` (per `AGENTS.md`).
- No project-level pytest/unittest usage detected in `pipeline/*.py` at analysis time.

## Worker package

- Separate package in `worker/` with its own `package.json` and `tsconfig.json`; not fully unified with root ESLint config (worker has no `lint` script in `worker/package.json`). When editing worker code, keep **strict** TypeScript and match existing Express patterns in `worker/src/server.ts` and `worker/src/ingest.ts`.

---

*Convention analysis: 2026-04-07*
