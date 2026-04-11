# Architecture

**Analysis Date:** 2026-04-11

## Pattern Overview

**Overall:** Monorepo with a **Next.js 15 App Router** web application (UI + Route Handlers), a **separate Express worker** for long-running film ingest, and an optional **Python CLI pipeline** that mirrors boundary detection and classification against Postgres. Shared **Drizzle schema** and **domain libraries** in `src/` are consumed by both Next and the worker via relative imports from `worker/`.

**Key Characteristics:**

- **Server-first UI:** `(site)` pages default to `dynamic = "force-dynamic"` to avoid build-time DB access; data loads in Server Components where possible.
- **Dual ingest lane:** Interactive ingest can run in **Next** (`src/app/api/ingest-film/stream/route.ts`) or be **proxied** to the worker (`src/lib/ingest-worker-delegate.ts`); production often uses the worker for timeouts and disk/ffmpeg.
- **Single source of truth:** Postgres (Neon) + `src/db/schema.ts`; `src/db/queries.ts` centralizes read patterns for pages and APIs.

## Layers

**Presentation (App Router + React):**

- Purpose: Public pages, layouts, client interactivity where needed.
- Location: `src/app/`, `src/components/`
- Contains: Route segments, Server/Client Components, D3 visualizations under `src/components/visualize/`, shadcn-style primitives under `src/components/ui/`.
- Depends on: `@/db`, `@/lib/*`, `@/components/*`
- Used by: Browser requests to the Next deployment.

**API / Route Handlers:**

- Purpose: JSON APIs, streaming (SSE), uploads, RAG, v1 search, eval and tuning endpoints.
- Location: `src/app/api/**/route.ts`
- Contains: `POST`/`GET` handlers; some routes import heavy stacks (`ffmpeg-static`, ingest) with tracing configured in `next.config.ts`.
- Depends on: `@/lib/*`, `@/db`
- Used by: UI, external clients, worker proxy callers.

**Domain & ingest logic (shared TypeScript):**

- Purpose: Shot detection, Gemini classification, S3, rate limiting, boundary fusion/presets, TMDB, scene grouping, provenance.
- Location: `src/lib/` (notably `src/lib/ingest-pipeline.ts`, `src/lib/boundary-ensemble.ts`, `src/lib/boundary-fusion.ts`, `src/lib/boundary-cut-preset.ts`, `src/lib/ffmpeg-bin.ts`, `src/lib/s3.ts`, `src/lib/rate-limiter.ts`, `src/lib/taxonomy.ts`)
- Contains: Pure/domain logic and side-effecting orchestration used by both Next and worker.
- Depends on: Node APIs, env, external HTTP (Gemini, OpenAI, AWS, TMDB, Replicate as wired by callers).
- Used by: `src/app/api/*`, `worker/src/ingest.ts`, scripts under `scripts/`.

**Data access:**

- Purpose: Drizzle client singleton, schema, typed query helpers, embeddings helpers, boundary-tuning queries.
- Location: `src/db/index.ts`, `src/db/schema.ts`, `src/db/queries.ts`, `src/db/boundary-tuning-queries.ts`, `src/db/embeddings.ts` (and related), `src/db/load-env.ts`
- Contains: Table definitions (films, scenes, shots, metadata, vectors, jobs, eval/boundary tables), query functions consumed by routes and pages.
- Depends on: `@neondatabase/serverless`, `drizzle-orm`, `DATABASE_URL`
- Used by: Next app and worker (`worker/src/db.ts` re-exports schema from `src/db/schema.ts`).

**Long-running worker (Express):**

- Purpose: SSE film ingest and detect-only boundary API with local disk and ffmpeg; avoids serverless limits.
- Location: `worker/src/server.ts`, `worker/src/ingest.ts`, `worker/src/boundary-detect.ts`, `worker/src/s3.ts`
- Contains: HTTP server, streaming handler, DB wiring.
- Depends on: `../../src/lib/*` and `../../src/db/schema.js` (runtime via tsx or bundled output).
- Used by: Operators / UI when `INGEST_WORKER_URL` or `NEXT_PUBLIC_WORKER_URL` is set; direct `POST` to worker routes.

**Python pipeline (offline / batch):**

- Purpose: PySceneDetect-based detection, clip extraction, Gemini classification, optional TransNet cuts, DB writes — parallel path to TS ingest.
- Location: `pipeline/main.py`, `pipeline/shot_detect.py`, `pipeline/classify.py`, `pipeline/extract_clips.py`, `pipeline/write_db.py`, `pipeline/batch_worker.py`, `pipeline/taxonomy.py`
- Contains: CLI entry, Python rate limiting (`pipeline/rate_limiter.py`), taxonomy mirror of `src/lib/taxonomy.ts` (must stay in sync).
- Depends on: Python venv, ffmpeg, env for Gemini/DB; optional TransNet (`pipeline/transnet_cuts.py`).
- Used by: `python -m pipeline.main` (and root `pnpm batch-worker` → `python3 -m pipeline.batch_worker`).

**Tooling & eval (Node scripts):**

- Purpose: Boundary F1 eval, export predicted cuts, sweeps, schema/taxonomy checks — no UI.
- Location: `scripts/*.ts` (invoked via `package.json` scripts), reads/writes under `eval/`.
- Depends on: `src/lib/*` for shared eval/boundary math where applicable.
- Used by: CI (`pnpm eval:smoke`), local research.

## Data Flow

**Browse / detail pages:**

1. Request hits a Server Component page under `src/app/(site)/` (e.g. `src/app/(site)/film/[id]/page.tsx`, `src/app/(site)/shot/[id]/page.tsx`).
2. Page calls functions in `src/db/queries.ts` using `db` from `src/db/index.ts`.
3. Response HTML streams to the client; interactive islands use Client Components (e.g. `src/components/video/shot-player.tsx`).

**Search / RAG:**

1. UI or API calls `src/app/api/search/route.ts` or `src/app/api/rag/route.ts`.
2. Search uses pgvector paths in `src/db/queries.ts` when embeddings exist; RAG composes retrieval + LLM (rate-limited via `src/lib/rate-limiter.ts`).

**Film ingest (happy path with delegation):**

1. Client posts JSON to Next `POST /api/ingest-film/stream` (`src/app/api/ingest-film/stream/route.ts`).
2. If `resolveIngestWorkerProxyTarget()` in `src/lib/ingest-worker-delegate.ts` returns an origin, the handler forwards the body to `POST {origin}/api/ingest-film/stream` on the worker and streams SSE back.
3. Worker `worker/src/ingest.ts` resolves video (path or download), calls `detectShotsForIngest`, parallel `classifyShot`, extraction/upload from `src/lib/ingest-pipeline.ts`, persists via Drizzle (`worker/src/db.ts`), records stages via `src/lib/ingest-run-record.ts` / `ingest_runs` table.

**Film ingest (same process on Next):**

1. Same route without worker URL runs pipeline inline in the Route Handler (same `src/lib/ingest-pipeline.ts` entry points), subject to `maxDuration` and hosting limits.

**Boundary tuning / eval (product + DB):**

1. Presets and revisions: Next APIs under `src/app/api/boundary-presets/`, `src/app/api/eval-gold-revisions/`, `src/app/api/boundary-eval-runs/`, `src/app/api/films/[id]/boundary-cut-preset/route.ts` backed by `src/db/boundary-tuning-queries.ts` and tables in `src/db/schema.ts` (`boundaryCutPresets`, `evalGoldRevisions`, `boundaryEvalRuns`).
2. Worker detect-only: `POST /api/boundary-detect` in `worker/src/boundary-detect.ts` returns JSON cuts using preset + `detectShotsForIngest` options.
3. Offline eval: `scripts/eval-pipeline.ts` compares `eval/gold/*.json` to `eval/predicted/*.json` (see `eval/gold/README.md`).

**Python pipeline CLI:**

1. `pipeline/main.py` loads video, runs `detect_shots` / `detect_and_export`, optionally `extract_clips`, `classify_shot`, then `write_to_db` against Postgres — independent of Next request cycle.

**State Management:**

- **Server state:** Postgres via Drizzle; no global Redux store. **URL/search params** drive filters on browse/visualize pages where applicable.
- **Client state:** React `useState` / local component state for players, forms, tuning UI (`src/components/tuning/tuning-workspace.tsx`, `src/components/eval/gold-annotate-workspace.tsx`).

## Key Abstractions

**Ingest pipeline orchestration:**

- Purpose: End-to-end shot boundaries, clip extraction, S3 upload, Gemini classification, parallelism.
- Examples: `src/lib/ingest-pipeline.ts`, consumed by `worker/src/ingest.ts`, `src/app/api/ingest-film/stream/route.ts`
- Pattern: Exported functions (`detectShotsForIngest`, `classifyShot`, `processInParallel`, …) + `ProgressEvent` stream type for SSE.

**Boundary detection configuration:**

- Purpose: Merge PyScene modes, optional extra cuts, fusion policies, DB-backed presets.
- Examples: `src/lib/boundary-ensemble.ts`, `src/lib/boundary-fusion.ts`, `src/lib/boundary-cut-preset.ts`, `worker/src/boundary-detect.ts`
- Pattern: Env + JSON preset → options for `detectShotsForIngest`.

**Taxonomy as types + allowed slugs:**

- Purpose: Single composition vocabulary for DB columns and prompts.
- Examples: `src/lib/taxonomy.ts`, `pipeline/taxonomy.py`
- Pattern: TypeScript string union types tied to schema columns; Python mirror for the pipeline (`pnpm check:taxonomy`).

**Query layer for UI/API:**

- Purpose: Reusable selects/joins, search, export shapes, visualization rows.
- Examples: `src/db/queries.ts`, `src/lib/viz-shot-map.ts` (viz row mapping)
- Pattern: Drizzle builder API, exported functions per feature area.

## Entry Points

**Next.js application:**

- Location: `next.config.ts`, `src/app/layout.tsx`, `src/app/(site)/layout.tsx`
- Triggers: Vercel/Node `pnpm dev` / `pnpm start`
- Responsibilities: SSR/SSG boundaries, Route Handlers under `src/app/api/`, static assets.

**Worker HTTP server:**

- Location: `worker/src/server.ts`
- Triggers: `cd worker && pnpm dev` or `pnpm start` after `pnpm build` in `worker/`
- Responsibilities: CORS, `POST /api/ingest-film/stream`, `POST /api/boundary-detect`, `GET /health`.

**Python pipeline:**

- Location: `pipeline/main.py`, `pipeline/batch_worker.py`
- Triggers: `python main.py` from `pipeline/` (with venv), or root npm script for batch worker
- Responsibilities: CLI-driven detect/classify/write.

**CLI eval / maintenance:**

- Location: `scripts/eval-pipeline.ts`, `scripts/export-film-eval.ts`, `scripts/detect-export-cuts.ts`, `scripts/check-schema-drift.ts`, `scripts/check-taxonomy-parity.ts`, `scripts/clear-app-data.ts`
- Triggers: `pnpm eval:*`, `pnpm detect:*`, `pnpm check:*`, `pnpm db:clear`
- Responsibilities: Offline analysis, DB hygiene, parity checks.

## Error Handling

**Strategy:** Return `Response` with appropriate HTTP status from Route Handlers; worker uses Express `res.status` + JSON/SSE error events; library code throws `Error` for validation failures caught at route boundaries.

**Patterns:**

- Ingest stream: `ProgressEvent` with `type: "error"` from `src/lib/ingest-pipeline.ts`; proxy failures wrapped in `src/lib/ingest-worker-delegate.ts` (`proxyFailureResponse`).
- JSON parse / validation: Early `400` responses in routes (e.g. `src/app/api/ingest-film/stream/route.ts`).

## Cross-Cutting Concerns

**Logging:** `console` with prefixed tags (e.g. `[classify]`, `[worker]`); structured server logging helpers in `src/lib/server-log.ts` where used.

**Validation:** Request body parsing in Route Handlers and worker handlers; timeline parsing via `parseIngestTimelineFromBody` in `src/lib/ingest-pipeline.ts`.

**Authentication:** No end-user auth (public site). **API keys** for v1 API (`src/db/schema.ts` `apiKeys`, routes under `src/app/api/v1/`). Optional **gates** for LLM/process routes documented in `AGENTS.md` (env-based secrets on headers).

**Rate limiting:** `src/lib/rate-limiter.ts` (`acquireToken`) before Gemini (and related) calls in TS; Python `pipeline/rate_limiter.py` for parity.

---

*Architecture analysis: 2026-04-11*
