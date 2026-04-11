# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** Multi-process monorepo — a Next.js 15 App Router application (MetroVision / SceneDeck) as the primary web surface, plus an optional long-running Express worker and a Python batch/CLI pipeline. All processes share the same Neon PostgreSQL database; there is no in-repo Redis or message broker.

**Key Characteristics:**

- **Server-first UI:** Public and app pages under `src/app/(site)/` are React Server Components by default; they import query functions from `src/db/queries.ts` and pass data into client components where interactivity is required.
- **Colocated API routes:** HTTP and streaming endpoints live beside pages under `src/app/api/**/route.ts` (Route Handlers).
- **Dual ingest paths:** Interactive ingestion can run inside Next (`src/app/api/ingest-film/stream/route.ts` using `src/lib/ingest-pipeline.ts`) or in the standalone worker (`worker/src/server.ts` → `worker/src/ingest.ts`) for environments where the Next runtime should not run FFmpeg/Gemini-heavy work.
- **Python for offline batch:** `pipeline/main.py` orchestrates PySceneDetect, clip extraction, Gemini classification, and `pipeline/write_db.py` writes via `psycopg2`; `pipeline/batch_worker.py` polls `batch_jobs` with `FOR UPDATE SKIP LOCKED`.

## Layers

**Presentation (App Router):**

- Purpose: Routing, metadata, layouts, and composition of UI.
- Location: `src/app/`
- Contains: `layout.tsx`, `error.tsx`, `not-found.tsx`, route groups `(site)/`, and `api/*/route.ts` handlers.
- Depends on: `src/components/**`, `src/db/queries.ts`, `src/lib/**` (domain helpers).
- Used by: Browsers and external API clients hitting `/api/*` and `/api/v1/*`.

**UI components:**

- Purpose: Reusable views — films, shots, video overlays, visualizations (D3), verify flows.
- Location: `src/components/`
- Contains: Domain folders (`films/`, `shots/`, `video/`, `visualize/`, `verify/`, `layout/`, etc.) and `src/components/ui/` (primitives).
- Depends on: `src/lib/*` (taxonomy display, utils), hooks in `src/hooks/`.
- Used by: Pages in `src/app/(site)/`.

**Application / domain logic (TypeScript):**

- Purpose: Taxonomy, ingest orchestration, RAG retrieval helpers, S3, TMDB, rate limiting, export, verification rules, types.
- Location: `src/lib/`
- Contains: Cohesive modules such as `src/lib/taxonomy.ts`, `src/lib/ingest-pipeline.ts`, `src/lib/rag-retrieval.ts`, `src/lib/s3.ts`, `src/lib/queue.ts`, `src/lib/types.ts`.
- Depends on: `src/db/` for persistence helpers where applicable (`@/db` alias).
- Used by: Route handlers and Server Components.

**Data access:**

- Purpose: Drizzle schema, singleton DB client, SQL-shaped query API, embedding generation scripts.
- Location: `src/db/`
- Contains: `src/db/schema.ts` (tables: `films`, `scenes`, `shots`, `shot_metadata`, `shot_semantic`, `verifications`, `shot_embeddings`, `shot_objects`, `pipeline_jobs`, `batch_jobs`, `scene_embeddings`, `film_embeddings`, `corpus_chunks`, `api_keys`), `src/db/index.ts`, `src/db/queries.ts`, `src/db/embeddings.ts`, `src/db/load-env.ts`, maintenance scripts (`generate-embeddings.ts`, `generate-scene-embeddings.ts`, `ingest-corpus.ts`).
- Depends on: `@neondatabase/serverless` + `drizzle-orm/neon-http` in `src/db/index.ts`.
- Used by: All Next.js server code that reads or writes the database.

**Worker (Express):**

- Purpose: Dedicated HTTP service for SSE film ingestion without Vercel time limits; mirrors much of the Next ingest flow.
- Location: `worker/src/`
- Contains: `worker/src/server.ts`, `worker/src/ingest.ts`, `worker/src/db.ts`, `worker/src/schema.ts`, `worker/src/s3.ts`.
- Depends on: Same stack family as app (Drizzle + Neon + AWS SDK) but **separate** `package.json` and compiled output; schema is duplicated in `worker/src/schema.ts` relative to `src/db/schema.ts`.
- Used by: Operators or the frontend when configured to call the worker origin instead of Next ingest routes.

**Python pipeline:**

- Purpose: CLI and batch workers for shot detection, FFmpeg clip extraction, Gemini classification with rate limiting, and direct Postgres writes.
- Location: `pipeline/`
- Contains: `pipeline/main.py`, `pipeline/batch_worker.py`, `pipeline/shot_detect.py`, `pipeline/extract_clips.py`, `pipeline/classify.py`, `pipeline/write_db.py`, `pipeline/taxonomy.py`, `pipeline/config.py`, `pipeline/rate_limiter.py`.
- Depends on: `psycopg2`, local tools (FFmpeg, PySceneDetect paths from config); `DATABASE_URL` (existence only — do not commit values).
- Used by: CLI operators and `pnpm batch-worker` / `python -m pipeline.batch_worker`.

## Data Flow

**Browse / detail pages (read path):**

1. User requests a route under `src/app/(site)/` (e.g. `src/app/(site)/browse/page.tsx`).
2. The Server Component calls functions in `src/db/queries.ts` (e.g. `getAllFilms`, `getAllShots`, `searchShots`).
3. `queries.ts` uses `db` from `src/db/index.ts` with `schema` from `src/db/schema.ts` to run Drizzle selects/joins.
4. Serialized props flow into client components (e.g. `src/components/films/film-browser.tsx`, `src/components/shots/shot-browser.tsx`).

**Ingest (Next SSE path):**

1. Client posts to `src/app/api/ingest-film/stream/route.ts` with film metadata and a **local** `videoPath` (server-side filesystem).
2. The handler opens a `ReadableStream` and emits SSE progress events.
3. Steps invoke `src/lib/ingest-pipeline.ts` (`detectShots`, `extractLocally`, `uploadAssets`, `classifyShot`, `processInParallel`) and TMDB helpers from `src/lib/tmdb.ts`.
4. Rows are written via Drizzle in the same route file (e.g. film upsert, shot and metadata inserts) using `src/db/index.ts`.

**Ingest (Express worker path):**

1. Client or proxy POSTs to `worker` `POST /api/ingest-film/stream` handled by `worker/src/ingest.ts`.
2. Same conceptual pipeline (detect → extract → classify → S3 → DB) with implementation inside the worker package.
3. Database access goes through `worker/src/db.ts` and `worker/src/schema.ts`.

**Python batch pipeline:**

1. `pipeline/batch_worker.py` claims a row from `batch_jobs` using `SKIP LOCKED`.
2. Processing uses `detect_shots`, `extract_clips`, `classify_shot`, and `write_to_db` in `pipeline/write_db.py`.
3. Taxonomy validation runs in Python via `pipeline/taxonomy.py` before inserts (aligned with TS taxonomy in `src/lib/taxonomy.ts` conceptually).

**RAG (optional LLM Q&A):**

1. `src/app/api/rag/route.ts` accepts a `query`, retrieves context via `src/lib/rag-retrieval.ts`, then calls Gemini with `acquireToken()` from `src/lib/rate-limiter.ts`.

**Postgres-backed job queue (TypeScript):**

1. `src/lib/queue.ts` inserts and claims rows in `pipeline_jobs` via optimistic locking patterns (find queued → update if still queued).
2. Intended for staged work (`detect`, `extract`, `classify`, `embed`) without Redis.

**State Management:**

- **Server state:** Postgres via Drizzle; no global Redux/store in the architecture doc scope.
- **Client state:** Local React state in `"use client"` components and hooks (e.g. `src/hooks/use-realtime-detection.ts` for object detection UX).

## Key Abstractions

**Taxonomy:**

- Purpose: Single source of slug types and allowed values for composition and shot metadata (TS).
- Examples: `src/lib/taxonomy.ts`, mirrored in `pipeline/taxonomy.py` for Python writes.
- Pattern: String literal unions / branded slugs in TS; validation functions in Python before SQL.

**Query layer:**

- Purpose: Encapsulate complex joins, filters, search, and export shapes away from pages and API routes.
- Examples: `src/db/queries.ts` (large module aggregating film/shot/verification/visualization queries).
- Pattern: Export named async functions; import `db` and `schema` from `@/db`.

**Ingest pipeline module:**

- Purpose: Shared steps for shot detection (spawned processes), S3 upload, Gemini classification, parallelism.
- Examples: `src/lib/ingest-pipeline.ts` (Next); parallel logic in `worker/src/ingest.ts`.
- Pattern: Progress callbacks / SSE `ProgressEvent` union type in `src/lib/ingest-pipeline.ts`.

**Media URLs:**

- Purpose: Normalize storage URLs for the browser (S3 proxy vs legacy blob references).
- Examples: `src/lib/s3.ts`, `src/app/api/s3/route.ts`; URL rewriting helpers inside `src/db/queries.ts` (e.g. `proxyBlobUrl`).

## Entry Points

**Next.js application:**

- Location: `package.json` scripts — `next dev`, `next build`, `next start`.
- Triggers: Vercel or local `pnpm dev`.
- Responsibilities: Full UI, most API routes, server-side ingest when `videoPath` is accessible to the Node process.

**Worker HTTP server:**

- Location: `worker/src/server.ts` (dev: `worker/package.json` → `tsx watch src/server.ts`).
- Triggers: Manual start on configured `PORT` (default from code: `3100`).
- Responsibilities: CORS-enabled JSON + SSE ingest endpoint `POST /api/ingest-film/stream`, health at `/health`.

**Python CLI:**

- Location: `pipeline/main.py` (`argparse` subcommands for review export and full pipeline).
- Triggers: `python main.py` from `pipeline/` with appropriate flags.
- Responsibilities: Offline processing and review artifact generation under configured output dirs (`pipeline/config.py`).

**Python batch worker:**

- Location: `pipeline/batch_worker.py` — `python -m pipeline.batch_worker` or root script `pnpm batch-worker`.
- Triggers: Long-running process polling `batch_jobs`.
- Responsibilities: Bulk ingestion aligned with batch job rows.

**Database scripts:**

- Location: `src/db/generate-embeddings.ts`, `src/db/generate-scene-embeddings.ts`, `src/db/ingest-corpus.ts`; invoked via `package.json` (`db:embeddings`, `embeddings:scenes`, `corpus:ingest`).
- Triggers: Operator CLI with `tsx`.
- Responsibilities: Backfill embeddings and corpus chunks.

## Error Handling

**Strategy:** Per-route and per-layer; no single global error middleware in Next (no `middleware.ts` detected at repo root). API routes return `Response` with JSON bodies and appropriate status codes. Streaming routes catch errors and emit structured error events where implemented.

**Patterns:**

- Route Handlers: `try/catch` with `NextResponse` or `new Response(JSON.stringify({ error: ... }), { status })` (see ingest and agent routes).
- Express worker: Errors propagate from async handler; SSE streams should close gracefully on failure (implementations in `worker/src/ingest.ts`).
- Python: `psycopg2` context managers in `pipeline/write_db.py`; batch worker handles shutdown via signals in `pipeline/batch_worker.py`.

## Cross-Cutting Concerns

**Logging:** `console` in worker (`worker/src/server.ts`) and typical Next server logging; no unified structured logger module detected in `src/`.

**Validation:** Taxonomy slug checks in Python (`pipeline/write_db.py` + `pipeline/taxonomy.ts`); request body checks in individual `route.ts` files; `src/lib/validation-rules.ts` for domain rules where used.

**Authentication:** Public site; API key model for external API (`api_keys` table in `src/db/schema.ts`, usage via `src/lib/api-auth.ts` on v1 routes). No NextAuth/session layer in architecture scope.

---

*Architecture analysis: 2026-04-07*
