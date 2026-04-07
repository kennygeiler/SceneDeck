# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```
SceneDeck/
├── src/                      # Next.js app source (App Router)
│   ├── app/                  # Routes, layouts, Route Handlers
│   ├── components/           # React UI by domain + ui primitives
│   ├── db/                   # Drizzle schema, client, queries, scripts
│   ├── hooks/                # Client hooks
│   ├── lib/                  # Domain logic, integrations, types
│   └── styles/               # Global CSS and design tokens
├── worker/                   # Standalone Express ingest service (own package.json)
│   └── src/
├── pipeline/                 # Python CLI + batch worker
├── drizzle/                  # Drizzle Kit migrations (generated output)
├── public/                   # Static assets
├── package.json              # Root Next app (name: metrovision)
├── tsconfig.json             # path alias @/* → ./src/*
├── drizzle.config.ts         # Drizzle Kit → schema at src/db/schema.ts
├── next.config.ts            # Next.js config (if present)
├── components.json           # shadcn/ui config
└── pnpm-workspace.yaml       # Workspace definition (worker may be excluded)
```

## Directory Purposes

**`src/app/`:**

- Purpose: All Next.js routes and API endpoints.
- Contains: Root `layout.tsx`, `src/app/(site)/` group for marketing and app pages, `src/app/api/**/route.ts` for HTTP.
- Key files: `src/app/layout.tsx`, `src/app/(site)/layout.tsx`, `src/app/icon.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`.

**`src/app/(site)/`:**

- Purpose: Shared `SiteShell` layout for main UX pages.
- Contains: One folder per route (`page.tsx`, optional `loading.tsx`).
- Key files: `src/app/(site)/layout.tsx`, `src/app/(site)/page.tsx`, `src/app/(site)/browse/page.tsx`, `src/app/(site)/film/[id]/page.tsx`, `src/app/(site)/shot/[id]/page.tsx`, `src/app/(site)/agent/page.tsx`, `src/app/(site)/visualize/page.tsx`, `src/app/(site)/ingest/page.tsx`, `src/app/(site)/verify/page.tsx`, `src/app/(site)/admin/page.tsx`, `src/app/(site)/export/page.tsx`, `src/app/(site)/decks/page.tsx`, `src/app/(site)/review-splits/page.tsx`, nested verify routes under `src/app/(site)/verify/`.

**`src/app/api/`:**

- Purpose: Route Handlers (REST + streaming).
- Contains: Feature folders with `route.ts`.
- Key files: `src/app/api/agent/chat/route.ts`, `src/app/api/ingest-film/stream/route.ts`, `src/app/api/ingest-film/route.ts`, `src/app/api/search/route.ts`, `src/app/api/rag/route.ts`, `src/app/api/s3/route.ts`, `src/app/api/shots/route.ts`, `src/app/api/verifications/route.ts`, `src/app/api/verifications/[shotId]/route.ts`, `src/app/api/v1/films/route.ts`, `src/app/api/v1/shots/route.ts`, `src/app/api/v1/search/route.ts`, `src/app/api/v1/taxonomy/route.ts`, batch and admin routes under `src/app/api/batch/`, `src/app/api/admin/`, upload routes `src/app/api/upload-video/route.ts`, `src/app/api/upload-to-s3/route.ts`, `src/app/api/detect-objects/route.ts`, `src/app/api/export/route.ts`, `src/app/api/group-scenes/route.ts`, `src/app/api/process-scene/route.ts`.

**`src/components/`:**

- Purpose: Presentation and feature UI.
- Contains: `agent/`, `decks/`, `export/`, `films/`, `home/`, `layout/`, `review/`, `shots/`, `verify/`, `video/`, `visualize/`, and `ui/` for shared primitives.
- Key files: `src/components/layout/site-shell.tsx`, `src/components/video/shot-player.tsx`, `src/components/video/metadata-overlay.tsx`, `src/components/agent/chat-interface.tsx`, `src/components/visualize/viz-dashboard.tsx`.

**`src/db/`:**

- Purpose: Database layer for the Next app.
- Contains: Schema, client, queries, embeddings helpers, env loader, one-off scripts.
- Key files: `src/db/schema.ts`, `src/db/index.ts`, `src/db/queries.ts`, `src/db/embeddings.ts`, `src/db/load-env.ts`, `src/db/generate-embeddings.ts`, `src/db/generate-scene-embeddings.ts`, `src/db/ingest-corpus.ts`.

**`src/lib/`:**

- Purpose: Shared non-UI logic consumed by routes and components.
- Key files: `src/lib/taxonomy.ts`, `src/lib/types.ts`, `src/lib/ingest-pipeline.ts`, `src/lib/agent-tools.ts`, `src/lib/agent-system-prompt.ts`, `src/lib/rag-retrieval.ts`, `src/lib/s3.ts`, `src/lib/tmdb.ts`, `src/lib/queue.ts`, `src/lib/api-auth.ts`, `src/lib/rate-limiter.ts`, `src/lib/shot-display.ts`, `src/lib/utils.ts`.

**`src/hooks/`:**

- Purpose: Client-only hooks.
- Example: `src/hooks/use-realtime-detection.ts`.

**`src/styles/`:**

- Purpose: Global styles and tokens.
- Key files: `src/styles/globals.css`, `src/styles/tokens.css`.

**`worker/src/`:**

- Purpose: Express service codebase.
- Key files: `worker/src/server.ts`, `worker/src/ingest.ts`, `worker/src/db.ts`, `worker/src/schema.ts`, `worker/src/s3.ts`.
- Note: Separate Node project — install and run from `worker/` per `worker/package.json`.

**`pipeline/`:**

- Purpose: Python ingestion and classification.
- Key files: `pipeline/main.py`, `pipeline/batch_worker.py`, `pipeline/shot_detect.py`, `pipeline/extract_clips.py`, `pipeline/classify.py`, `pipeline/write_db.py`, `pipeline/taxonomy.py`, `pipeline/config.py`, `pipeline/rate_limiter.py`, `pipeline/requirements.txt`.

**`drizzle/`:**

- Purpose: SQL migrations generated by Drizzle Kit.
- Generated: Yes (via `pnpm db:generate`).
- Committed: Typically yes (migration history).

**`.planning/`:**

- Purpose: GSD / planning artifacts (including this document).
- Key path: `.planning/codebase/` for mapper outputs.

**`.kiln/` (if present):**

- Purpose: Kiln pipeline docs and architecture reference (read-only for mappers).

## Key File Locations

**Entry Points:**

- `package.json`: Next.js dev/build/start scripts for the main app.
- `worker/package.json`: `dev`, `build`, `start` for the Express worker.
- `pipeline/main.py`: Python CLI entry.
- `pipeline/batch_worker.py`: Long-running batch consumer.

**Configuration:**

- `tsconfig.json`: `@/*` → `./src/*`.
- `drizzle.config.ts`: schema path and migration output `drizzle/`.
- `eslint.config.mjs` or equivalent: at repo root (lint via `pnpm lint`).
- `components.json`: shadcn/ui paths (typically `src/components/ui`).

**Core Logic:**

- `src/db/schema.ts`: Table definitions and inferred types.
- `src/db/queries.ts`: Application query API for pages and routes.
- `src/lib/ingest-pipeline.ts`: Next-side ingest steps shared with streaming route.

**Testing:**

- Not detected: no `*.test.ts` / `vitest.config` / `jest.config` at project root in current tree snapshot — add tests alongside features or under a dedicated `tests/` directory if introduced.

## Naming Conventions

**Files:**

- Route segments: Next conventions — `page.tsx`, `layout.tsx`, `loading.tsx`, `route.tsx` / `route.ts` under `api/`.
- Components: kebab-case filenames (e.g. `shot-player.tsx`, `site-shell.tsx`) with PascalCase default exports inside.
- Lib modules: kebab-case `ingest-pipeline.ts`, `agent-tools.ts`, `shot-display.ts`.

**Directories:**

- `src/components/` grouped by domain (`films/`, `shots/`, `video/`).
- `src/app/api/` grouped by resource (`agent/`, `v1/`, `batch/`).

**Symbols:**

- Drizzle tables: camelCase exports mapping to snake_case SQL columns in `src/db/schema.ts` (e.g. `shotMetadata`, column `shot_id`).
- Types: exported from schema (`Film`, `Shot`, `PipelineJob`) and from `src/lib/types.ts` for cross-cutting DTOs.

## Where to Add New Code

**New Feature (user-facing page):**

- Primary code: `src/app/(site)/<feature>/page.tsx`.
- Layout: extend `src/app/(site)/layout.tsx` or add a nested `layout.tsx` under the feature folder.
- UI: `src/components/<domain>/`.
- Data: new query functions in `src/db/queries.ts` or a focused module under `src/db/` if the query surface is large.

**New API Route:**

- Implementation: `src/app/api/<resource>/route.ts` (or `[id]/route.ts` for dynamic segments).
- Shared logic: `src/lib/`.
- Auth for external API: `src/lib/api-auth.ts` pattern for `src/app/api/v1/*`.

**New Component:**

- Implementation: `src/components/<domain>/<name>.tsx`.
- Primitives: add or extend `src/components/ui/` following existing shadcn patterns.

**New Database Table:**

- Schema: `src/db/schema.ts`.
- Migrations: `pnpm db:generate` then apply per project workflow (`pnpm db:push` or migrate).
- Queries: `src/db/queries.ts` (or split file if the team introduces `src/db/queries/*.ts`).

**Worker-only behavior:**

- Code: `worker/src/`; mirror schema changes in `worker/src/schema.ts` if the worker must stay in sync.

**Python pipeline step:**

- Code: new module under `pipeline/`; wire from `pipeline/main.py` or `pipeline/batch_worker.py`; keep `pipeline/taxonomy.py` aligned with `src/lib/taxonomy.ts`.

**Utilities:**

- Shared helpers: `src/lib/utils.ts` for generic helpers; domain-specific helpers next to the domain (`src/lib/shot-display.ts`, etc.).

## Special Directories

**`worker/`:**

- Purpose: Independent Node service for ingest; not bundled into the Next.js build.
- Generated: `worker/dist/` after `pnpm build` inside `worker/`.
- Committed: Source yes; `node_modules/` and build output typically gitignored.

**`pipeline/`:**

- Purpose: Python virtualenv and CLI; not part of the pnpm workspace install.
- Generated: Clip and review output dirs per `pipeline/config.py` (operator-local).
- Committed: Source yes; venv and large media outputs typically gitignored.

**`.next/`:**

- Purpose: Next.js build cache and output.
- Generated: Yes.
- Committed: No.

---

*Structure analysis: 2026-04-07*
