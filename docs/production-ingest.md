# Production ingest (Vercel + worker)

Heavy ingest (FFmpeg, PySceneDetect, long SSE) must not rely on Vercel serverless alone. Use a **long-running TS worker** and point the Next app at it.

## Required for reliable prod ingest

1. **Set `INGEST_WORKER_URL`** (server-only, preferred) or **`NEXT_PUBLIC_WORKER_URL`** on Vercel to the worker **origin** only, e.g. `https://your-worker.railway.app` — no path, no trailing `/api`.
2. **Do not set** `METROVISION_DELEGATE_INGEST=0` unless you intentionally run ingest only on Next (not recommended for full films).
3. **On Vercel**, if neither worker URL is set, `POST /api/ingest-film/stream` returns **503** with a JSON error instead of starting a serverless ingest that will likely time out.
3. **Worker must expose** `GET /health` (JSON) and `POST /api/ingest-film/stream` (SSE), same contract as Next’s proxy.

## Verify after deploy

- **Config (optional lock):** `GET /api/health/config`  
  - If `METROVISION_CONFIG_CHECK_SECRET` is set, send `Authorization: Bearer <secret>`.
  - Confirm `ingestWillProxyToWorker: true` and `workerHealth.ok: true` when a worker URL is configured.
- **Worker directly:** `GET {WORKER_ORIGIN}/health`

## Operational notes

- **Neon + S3 + Gemini** must be present in both Vercel and the worker env where ingest runs (worker needs `DATABASE_URL`, keys, etc.).
- **Idle timeouts:** the app emits periodic SSE during prep/detect so proxies are less likely to close the stream; if drops persist, confirm worker logs and Vercel function duration limits.

## Re-ingest behavior

When ingest reaches the **group** step, it **deletes** existing `pipeline_jobs` and `batch_jobs` for that film, then **all shots** (cascading metadata, embeddings, verifications, etc.) and **scenes**, then writes fresh rows. The **`films`** row is kept and updated. This avoids orphan scenes from interrupted runs.

Each ingest creates a row in **`ingest_runs`** (`status`, `stage`, counts, errors) for observability. Apply migration `drizzle/0008_ingest_runs.sql` (or `pnpm db:push`) so the table exists before deploying this behavior.

## Cost and runaway protection (Phase 5)

- **Concurrency** on the ingest form caps parallel Gemini/FFmpeg work; keep it aligned with your API tier (see rate limiter / AC-07).
- **Timeline window** (`ingestStartSec` / `ingestEndSec`) narrows spend on long sources.
- For very large films, prefer the **Python batch pipeline** or raising worker resources over unbounded interactive runs.
