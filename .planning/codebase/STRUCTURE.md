# Codebase Structure

**Analysis Date:** 2026-04-11

## Directory Layout

```
MetroVision/
├── src/                    # Next.js app: App Router, components, shared lib, db
│   ├── app/                # Routes: (site) pages + api/ Route Handlers
│   ├── components/         # React UI by domain + ui/ primitives
│   ├── db/                 # Drizzle schema, queries, seeds, embeddings scripts
│   ├── lib/                # Domain logic shared with worker and scripts
│   └── styles/             # Global CSS, tokens
├── worker/                 # Express ingest worker (pnpm workspace package)
│   └── src/                # server.ts, ingest.ts, boundary-detect.ts, db.ts, s3.ts
├── pipeline/               # Python CLI: detect, classify, extract, write_db
├── scripts/                # TS CLI: eval, detect export, checks, clear data
├── eval/                   # Gold/predicted JSON, fixtures, run logs (operational)
├── drizzle/                # SQL migrations + Drizzle Kit meta
├── public/                 # Static assets
├── .github/workflows/      # CI (lint, taxonomy, schema, test, eval smoke, build)
├── package.json            # Root scripts and Next app dependencies
├── pnpm-workspace.yaml     # workspace: root + worker
├── next.config.ts          # Next config, ffmpeg trace includes
├── tsconfig.json           # paths: @/* → src/* ; worker excluded from root emit
├── vitest.config.ts        # Unit tests
└── AGENTS.md               # Operator commands and architecture TL;DR
```

## Directory Purposes

**`src/app/`:**

- Purpose: Next.js App Router tree: public UI and API.
- Contains: `layout.tsx`, `page.tsx`, dynamic segments, Route Handlers `route.ts`.
- Key files: `src/app/layout.tsx` (root fonts, metadata), `src/app/(site)/layout.tsx` (`force-dynamic`, `SiteShell`), `src/app/api/ingest-film/stream/route.ts`, `src/app/api/rag/route.ts`, `src/app/api/search/route.ts`, boundary/eval APIs under `src/app/api/boundary-*`, `src/app/api/eval-*`.

**`src/components/`:**

- Purpose: UI building blocks grouped by feature.
- Contains: `layout/` (shell, header), `visualize/` (D3 dashboards), `video/`, `films/`, `shots/`, `verify/`, `ingest/`, `export/`, `archive/`, `tuning/`, `eval/`, `ui/` (shadcn-style).
- Key files: `src/components/layout/site-shell.tsx`, `src/components/visualize/viz-dashboard.tsx`, `src/components/video/shot-player.tsx`.

**`src/lib/`:**

- Purpose: Shared TypeScript domain modules (imported by Next, worker, scripts).
- Contains: ingest, boundaries, S3, ffmpeg, rate limit, taxonomy, types, viz helpers.
- Key files: `src/lib/ingest-pipeline.ts`, `src/lib/ingest-worker-delegate.ts`, `src/lib/taxonomy.ts`, `src/lib/types.ts`, `src/lib/eval-cut-json.ts`.

**`src/db/`:**

- Purpose: Database layer for the app.
- Contains: `schema.ts`, `index.ts`, `queries.ts`, `boundary-tuning-queries.ts`, seed/embeddings utilities, `load-env.ts`.
- Key files: `src/db/schema.ts`, `src/db/queries.ts`, `src/db/index.ts`.

**`worker/`:**

- Purpose: Long-running Node service for ingest SSE and boundary-detect JSON.
- Contains: Express app, handlers that import `../../src/lib/*`.
- Key files: `worker/src/server.ts`, `worker/src/ingest.ts`, `worker/src/boundary-detect.ts`, `worker/src/db.ts`, `worker/package.json`.

**`pipeline/`:**

- Purpose: Python alternative/batch processing path.
- Contains: `main.py`, `shot_detect.py`, `classify.py`, `extract_clips.py`, `write_db.py`, `batch_worker.py`, `taxonomy.py`, optional `transnet_cuts.py`.
- Key files: `pipeline/main.py`, `pipeline/config.py`.

**`scripts/`:**

- Purpose: Node/tsx CLIs wired from root `package.json` `scripts` entries.
- Contains: `eval-pipeline.ts`, `eval-smoke.ts`, `export-film-eval.ts`, `detect-export-cuts.ts`, `detect-refine-fn-windows.ts`, `eval-boundary-deltas.ts`, `eval-boundary-misses.ts`, sweep scripts, `check-schema-drift.ts`, `check-taxonomy-parity.ts`, `clear-app-data.ts`, `ensure-ffmpeg-static.cjs`.

**`eval/`:**

- Purpose: Human-verified reference JSON (`gold/`), detector output (`predicted/`), sweep fixtures (`fixtures/`), optional TransNet inputs (`extra-cuts/`), run notebooks/logs (`runs/`).
- Contains: JSON/JSONL/MD artifacts; not all files are committed in every clone.
- Key files: `eval/gold/template.json`, `eval/gold/README.md`, `eval/runs/README.md`, `eval/runs/STATUS.md`, `eval/fixtures/README.md`.

**`drizzle/`:**

- Purpose: Versioned SQL migrations and Drizzle Kit journal/snapshots.
- Contains: `0000_*.sql` … `0009_*.sql`, `meta/_journal.json`.

**`.planning/`:**

- Purpose: Planning and codebase reference docs (this folder).
- Contains: `codebase/*.md` and other research artifacts as maintained by the team.

## Key File Locations

**Entry Points:**

- `src/app/layout.tsx`: Root HTML shell, fonts, global CSS import.
- `src/app/(site)/page.tsx`: Landing.
- `worker/src/server.ts`: Express listen and route registration.
- `pipeline/main.py`: Python CLI entry.

**Configuration:**

- `next.config.ts`: `serverExternalPackages`, `outputFileTracingIncludes` for ffmpeg routes, `images.remotePatterns`.
- `tsconfig.json`: `@/*` → `./src/*`; `worker` excluded from root project emit scope.
- `drizzle.config.ts`: Drizzle Kit config (repo root).
- `vitest.config.ts`: Test runner config.
- `worker/tsconfig.json`: Worker TypeScript project (`pnpm check:worker`).

**Core Logic:**

- `src/lib/ingest-pipeline.ts`: Ingest orchestration.
- `src/db/schema.ts`: Table definitions and JSONB payload types.
- `src/db/queries.ts`: Read/write helpers for pages and APIs.

**Testing:**

- `src/lib/__tests__/*.test.ts`: Vitest unit tests co-located under `__tests__`.

## Naming Conventions

**Files:**

- **kebab-case** for most TS/TSX files: `ingest-pipeline.ts`, `site-shell.tsx`, `gold-annotate-workspace.tsx`.
- **Route segments:** Next conventions — `page.tsx`, `layout.tsx`, `route.ts` inside folders like `film/[id]/`.

**Directories:**

- **kebab-case** under `src/components/` and `src/app/` route folders: `eval/gold-annotate/`, `tuning/workspace/`.
- **Python:** snake_case modules: `shot_detect.py`, `write_db.py`.

**Symbols (observed):**

- React components: **PascalCase** (`SiteShell`, `VizDashboard`).
- Functions/variables: **camelCase** (`detectShotsForIngest`, `searchShots`).
- Drizzle tables: **camelCase** exports (`films`, `shotMetadata`, `boundaryCutPresets`).

## Where to Add New Code

**New public page:**

- Route: `src/app/(site)/<segment>/page.tsx`.
- Shared chrome: reuse `src/components/layout/site-shell.tsx` via `(site)/layout.tsx`.

**New API route:**

- Handler: `src/app/api/<resource>/route.ts` (or dynamic `src/app/api/<resource>/[id]/route.ts`).
- DB access: add query helpers to `src/db/queries.ts` (or a focused module under `src/db/` if large), import `db` from `src/db/index.ts`.

**New UI component:**

- Feature-specific: `src/components/<domain>/<name>.tsx`.
- Primitives: extend `src/components/ui/` following existing shadcn patterns.

**New shared domain logic (Next + worker):**

- Implementation: `src/lib/<topic>.ts`.
- Wire worker: import from `../../src/lib/...` in `worker/src/*.ts` (tsx dev or esbuild bundle with `packages: external`).

**New database table:**

- Definition: `src/db/schema.ts`.
- Migration: `pnpm db:generate` / apply via Drizzle workflow in `drizzle/`.
- Queries: `src/db/queries.ts` or `src/db/boundary-tuning-queries.ts` for tuning-related tables.

**New Python pipeline stage:**

- Module: `pipeline/<module>.py`; wire from `pipeline/main.py` or `pipeline/batch_worker.py`.
- Taxonomy: update `pipeline/taxonomy.py` and `src/lib/taxonomy.ts` together (`pnpm check:taxonomy`).

**New eval script or offline job:**

- Script: `scripts/<name>.ts`, expose via `package.json` `"scripts"` with `tsx scripts/<name>.ts`.
- Inputs/outputs: prefer `eval/gold/`, `eval/predicted/`, `eval/runs/` for consistency.

**Worker-only behavior:**

- Handlers: `worker/src/<feature>.ts`, register in `worker/src/server.ts`.

## Special Directories

**`worker/node_modules/` / `worker/dist/`:**

- Purpose: Worker package install and esbuild output when built.
- Generated: `dist/` by `pnpm build` inside `worker/`; `node_modules` by install.
- Committed: No (should be gitignored).

**`.next/`:**

- Purpose: Next build cache and server output.
- Generated: Yes.
- Committed: No.

**`eval/predicted/` and `eval/runs/`:**

- Purpose: Operational eval outputs and logs.
- Generated: Yes (scripts and operators).
- Committed: Optional per team policy; many JSON/MD files are local experiment artifacts.

---

*Structure analysis: 2026-04-11*
