# External Integrations

**Analysis Date:** 2026-04-11

## APIs & External Services

**Google Gemini (classification / adjudication / optional detection):**

- Used from TypeScript ingest (`src/lib/ingest-pipeline.ts`, `src/lib/object-detection.ts`) with `GOOGLE_API_KEY`; model names from `GEMINI_CLASSIFY_MODEL`, `GEMINI_ADJUDICATE_MODEL` (see `src/lib/pipeline-provenance.ts`).
- Python pipeline uses `google-generativeai` (`pipeline/requirements.txt`, `pipeline/classify.py`).
- Rate limiting: `acquireToken()` in `src/lib/rate-limiter.ts` gates Gemini HTTP usage in ingest and RAG paths.

**OpenAI:**

- Package `openai` — Text embeddings (`src/lib/openai-embedding.ts`, `src/db/generate-embeddings.ts`), semantic search (`src/app/api/search/route.ts`), RAG retrieval context (`src/lib/rag-retrieval.ts` via `src/app/api/rag/route.ts`), corpus ingest (`src/db/ingest-corpus.ts`).
- Env: `OPENAI_API_KEY`.

**Anthropic:**

- Python dependency `anthropic` in `pipeline/requirements.txt` — available for pipeline LLM flows where implemented.

**Replicate:**

- Package `replicate` — CLIP image embeddings (`src/lib/image-embedding.ts`, `src/db/generate-image-embeddings.ts`); optional YOLO-style model for object detection (`src/lib/object-detection.ts`).
- Env: `REPLICATE_API_TOKEN`, optional `REPLICATE_CLIP_EMBEDDING_MODEL`, `REPLICATE_YOLO_MODEL`.

**TMDB (The Movie Database):**

- `src/lib/tmdb.ts` — Metadata lookup; `TMDB_API_KEY`.

**PySceneDetect (CLI / subprocess):**

- Invoked from Node (`src/lib/ingest-pipeline.ts`, boundary ensemble `src/lib/boundary-ensemble.ts`); binary path `SCENEDETECT_PATH` (default `scenedetect`).
- Python side uses `scenedetect[opencv]` (`pipeline/requirements.txt`, `pipeline/shot_detect.py`).

**TransNet V2 (optional):**

- Optional install `pipeline/requirements-transnet.txt`; CLI / JSON cuts path `pipeline/transnet_cuts.py`; merges with TS ingest via `METROVISION_EXTRA_BOUNDARY_CUTS_JSON` and related preset / request fields.

**FFmpeg:**

- System or `ffmpeg-static` binary; configuration in `src/lib/ffmpeg-bin.ts`, ingest pipeline `src/lib/ingest-pipeline.ts` (scene sample FPS, thresholds via `METROVISION_FFMPEG_*`).

## Data Storage

**Databases:**

- **Neon Serverless Postgres** — Connection string `DATABASE_URL`; clients `@neondatabase/serverless` with Drizzle (`src/db/index.ts`, `worker/src/db.ts`).
- **pgvector** — Custom vector columns in `src/db/schema.ts` (768-d shot / image embeddings, 1536-d corpus embeddings, etc.).

**File / object storage:**

- **AWS S3** — `src/lib/s3.ts`, `worker/src/s3.ts`; env `AWS_REGION` (defaults differ slightly: app `us-east-1`, worker `us-east-2` in code — align in deployment), `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`; presigned reads/writes.

**Caching:**

- No dedicated Redis/cache service in dependencies; in-process rate limiter and Next/server globals for dev DB singleton (`src/db/index.ts`).

## Authentication & Identity

**End-user auth:**

- Product stance: public archive (no login) per `AGENTS.md`.

**Operational / API gates:**

- Optional LLM abuse reduction: `METROVISION_LLM_GATE_SECRET` + `rejectIfLlmRouteGated` (`src/lib/llm-route-gate.ts`) on `POST /api/rag` (`src/app/api/rag/route.ts`).
- Eval artifact admin: `METROVISION_EVAL_ARTIFACT_ADMIN_SECRET` (`src/lib/eval-artifact-gate.ts`, `src/app/api/eval/artifacts/route.ts`).
- Optional `METROVISION_PROCESS_SCENE_SECRET` and API key patterns documented in `AGENTS.md` for restricted routes.

**Worker CORS:**

- `worker/src/server.ts` — `ALLOWED_ORIGINS`, optional `ALLOW_VERCEL_SUBDOMAINS=1` for `*.vercel.app`.

## Monitoring & Observability

**Error tracking:**

- No Sentry/Datadog SDK detected in root `package.json` / worker `package.json`.

**Logs:**

- Console logging in worker (`worker/src/server.ts` health fields: `hasGoogleKey`, `hasAws`, `hasDb`, `hasScenedetectPath`) and app code; search prefix patterns documented for DB search (`AGENTS.md` mentions `[searchShots]`).

## CI/CD & Deployment

**Hosting:**

- **Vercel** implied for Next.js (`NEXT_PUBLIC_SITE_URL` in CI points at `https://metrovision.vercel.app`); separate long-running **Express worker** for film-scale ingest (Railway or similar mentioned in worker log strings in `worker/src/ingest.ts`).

**CI pipeline:**

- **GitHub Actions** — `.github/workflows/ci.yml`, job `verify` on `ubuntu-latest`:
  - Checkout, **pnpm** 9, **Node** 20, `pnpm install --frozen-lockfile`
  - `pnpm lint`, `pnpm check:taxonomy`, `pnpm check:schema-drift`, `pnpm test`, `pnpm eval:smoke`
  - `pnpm build` with placeholder `DATABASE_URL` and `NEXT_PUBLIC_SITE_URL`
  - `pnpm check:worker` (`tsc --noEmit -p worker/tsconfig.json`)

**No secondary workflow files required for this audit** — single workflow governs PR/push to `main`/`master`.

## Environment Configuration

**Required for core app DB:**

- `DATABASE_URL` — Required at runtime in `src/db/index.ts` (throws if missing).

**Required for full ingest / media:**

- `GOOGLE_API_KEY` — Gemini calls in `src/lib/ingest-pipeline.ts`.
- AWS S3 variables — As above for uploads and signed URLs.

**Common optional / feature flags:**

- `OPENAI_API_KEY` — Search, RAG, embeddings scripts.
- `REPLICATE_API_TOKEN` — Image embeddings / optional detection models.
- `NEXT_PUBLIC_SITE_URL` — Public site base (e.g. thumbnail URLs for Replicate).
- `NEXT_PUBLIC_WORKER_URL` / `INGEST_WORKER_URL` — Delegate ingest to worker (`src/lib/ingest-worker-delegate.ts`, `src/components/tuning/tuning-workspace.tsx`).
- Boundary tuning: `METROVISION_BOUNDARY_DETECTOR`, `METROVISION_BOUNDARY_MERGE_GAP_SEC`, `METROVISION_EXTRA_BOUNDARY_CUTS_JSON`, `METROVISION_CLASSIFY_CONCURRENCY`, long-shot review seconds (`src/lib/pipeline-provenance.ts`), stream/remux overrides (`METROVISION_STREAM_REMOTE_VIDEO`, `METROVISION_FORCE_LOCAL_VIDEO_REMUX`).
- `TMDB_API_KEY` — Film metadata.
- `PORT` — Worker listen port (default `3100`, `worker/src/server.ts`).

**Secrets location:**

- Host environment (Vercel, Railway, local `.env`); never commit values. `src/db/load-env.ts` assists local Drizzle/app loading.

## Webhooks & Callbacks

**Incoming:**

- Standard Next.js Route Handlers under `src/app/api/**` and Express routes in `worker/src/server.ts` (e.g. ingest SSE, boundary detect). No third-party webhook receivers identified as dedicated subsystems in manifests.

**Outgoing:**

- HTTPS calls to Google Generative AI, OpenAI, Replicate; TMDB HTTP API; S3 AWS API.

---

*Integration audit: 2026-04-11*
