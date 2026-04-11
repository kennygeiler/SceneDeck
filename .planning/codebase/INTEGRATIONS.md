# External Integrations

**Analysis Date:** 2026-04-07

## APIs & External Services

**Google Gemini (Generative AI):**

- **Purpose:** Shot/film analysis, chat agent, RAG, object-detection assist, and Python batch classification.
- **Integration (TypeScript):** HTTP `fetch` to **Google AI Generative Language API** (`https://generativelanguage.googleapis.com/v1beta/models/...`) with `key` query param — see `src/lib/ingest-pipeline.ts`, `src/app/api/rag/route.ts`, `src/lib/object-detection.ts`.
- **Integration (Python):** `google.genai` client in `pipeline/classify.py` (ensure installed Python package matches this import; `pipeline/requirements.txt` lists `google-generativeai`).
- **Auth:** `GOOGLE_API_KEY` (primary). `GEMINI_API_KEY` is an alternate in `src/lib/object-detection.ts` when calling Gemini.

**OpenAI:**

- **Purpose:** Text embeddings (`src/db/embeddings.ts`, `src/db/generate-embeddings.ts`, `src/db/ingest-corpus.ts`), semantic search and RAG (`src/app/api/search/route.ts`, `src/app/api/rag/route.ts`, `src/app/api/v1/search/route.ts`, `src/lib/rag-retrieval.ts`), worker embedding calls (`worker/src/ingest.ts`).
- **SDK / client:** `openai` npm package.
- **Auth:** `OPENAI_API_KEY`.

**The Movie Database (TMDB):**

- **Purpose:** Film metadata (posters, credits, etc.) via REST (`src/lib/tmdb.ts`, worker ingest `worker/src/ingest.ts`).
- **Integration:** `fetch` to `https://api.themoviedb.org/3` with API key query param.
- **Auth:** `TMDB_API_KEY`.

**Replicate:**

- **Purpose:** Hosted object-detection model (YOLO-style) in `src/lib/object-detection.ts`.
- **SDK / client:** `replicate` npm package.
- **Auth:** `REPLICATE_API_TOKEN`. Optional model override: `REPLICATE_YOLO_MODEL`.

**Vercel Blob (legacy / optional):**

- **Purpose:** Fallback read token paths in `src/lib/object-detection.ts` for blob access.
- **Auth:** `BLOB_READ_WRITE_TOKEN` or `VERCEL_BLOB_READ_WRITE_TOKEN` (per code comments / ADR direction: prefer S3 for new work; see project docs).

## Data Storage

**Databases:**

- **PostgreSQL (Neon)** — Primary datastore; pgvector columns for embeddings defined in `src/db/schema.ts` (`vector(...)` custom type).
- **Connection:** `DATABASE_URL` (required in `src/db/index.ts`; optional load from `.env.local` via `src/db/load-env.ts`). Drizzle Kit uses the same in `drizzle.config.ts`.
- **Clients:**
  - App: `@neondatabase/serverless` + `drizzle-orm/neon-http` (`src/db/index.ts`).
  - Worker: same stack (`worker/src/db.ts`).
  - Pipeline: `psycopg2` direct connection (`pipeline/write_db.py`, `pipeline/batch_worker.py`).

**File Storage:**

- **AWS S3** — Video and media objects; presigned uploads/reads.
- **SDK:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` in `src/lib/s3.ts` and `worker/src/s3.ts`.
- **Auth:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (defaults: `us-east-1` in app `src/lib/s3.ts`, `us-east-2` in `worker/src/s3.ts` — align buckets/regions in deployment), `AWS_S3_BUCKET`.

**Caching:**

- None as a dedicated external cache (Redis/Memcached not present in application dependencies).

## Authentication & Identity

**End-user auth:**

- **Not used** for public site flows (per `AGENTS.md` / AC-21: no OAuth; public browsing).

**API portal / programmatic access:**

- **Database-backed API keys** — `src/lib/api-auth.ts` validates `Authorization: Bearer <key>` against `schema.apiKeys` (hashed keys). Used by versioned REST such as `src/app/api/v1/search/route.ts`. Keys are operator-issued, not env vars. Legacy `?api_key=` is **off by default** (leaks via logs/referrers); set `METROVISION_ALLOW_API_KEY_QUERY=true` only for a controlled migration window.

## Monitoring & Observability

**Error tracking:**

- Not detected — No Sentry/Datadog SDK in root `package.json`.

**Logs:**

- Application and worker logging to stdout/stderr (typical for Node on Vercel and long-running worker processes). No structured log shipping configured in-repo.

## CI/CD & Deployment

**Hosting:**

- **Vercel** — Strongly implied for the Next.js app (`NEXT_PUBLIC_SITE_URL`, default metadata base in `src/app/layout.tsx`).

**CI pipeline:**

- Not detected — No project-owned workflows under `.github/workflows/` at repo root (excluding vendored paths under `node_modules`).

**Worker deployment:**

- **Express worker** (`worker/src/server.ts`) — Separate deploy target; `PORT` (default `3100`), `ALLOWED_ORIGINS` (comma-separated; defaults include localhost and Vercel app URL).

## Environment Configuration

**Required / commonly required variables (names only; never commit values):**

- `DATABASE_URL` — Neon Postgres.
- `GOOGLE_API_KEY` — Gemini and related server routes.
- `OPENAI_API_KEY` — Embeddings and hybrid search/RAG.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` — S3.
- `TMDB_API_KEY` — Metadata enrichment when key present.
- `NEXT_PUBLIC_WORKER_URL` — Browser calls to ingest worker (`src/app/(site)/ingest/page.tsx`).
- `NEXT_PUBLIC_SITE_URL` — Canonical site URL for metadata (`src/app/layout.tsx`).

**Optional / feature-specific:**

- `METROVISION_LLM_GATE_SECRET` — Gates `POST /api/rag` behind header `x-metrovision-llm-gate` when set.
- `METROVISION_PROCESS_SCENE_SECRET` — Gates `POST /api/process-scene` behind header `x-metrovision-process-scene-secret` when set; route returns `503` on Vercel regardless.
- `METROVISION_ALLOW_API_KEY_QUERY` — Set `true` only to allow legacy `?api_key=` on v1 REST during migration (default: Bearer only).
- `SCENEDETECT_PATH` — Custom PySceneDetect binary (`src/lib/ingest-pipeline.ts`, `worker/src/ingest.ts`).
- `METROVISION_PYTHON_BIN` — Python executable for server-invoked pipeline (`src/app/api/process-scene/route.ts`).
- `REPLICATE_API_TOKEN`, `REPLICATE_YOLO_MODEL`, `GEMINI_API_KEY` — As above.
- `PORT`, `ALLOWED_ORIGINS` — Worker.

**Secrets location:**

- Local: `.env.local` at repo root (gitignored; loaded by `src/db/load-env.ts` and `pipeline/config.py`). Worker processes should inject the same variables in production.

## Webhooks & Callbacks

**Incoming:**

- Not detected — No Stripe/GitHub-style webhook routes identified as first-party integration endpoints in this audit.

**Outgoing:**

- Not detected — No registered outbound webhook dispatch to third parties; the ingest worker uses **SSE** streaming to clients (internal HTTP pattern, not an external webhook provider).

**Internal queues:**

- **Postgres `batch_jobs`** — Claimed with `FOR UPDATE SKIP LOCKED` in `pipeline/batch_worker.py` (application-level job queue, not BullMQ/Redis).

---

*Integration audit: 2026-04-07*
