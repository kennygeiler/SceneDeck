# Production ingest (Vercel + worker)

Heavy ingest (FFmpeg, PySceneDetect, long SSE) must not rely on Vercel serverless alone. Use a **long-running TS worker** and point the Next app at it.

## Railway: deploy the real worker (not the Next.js site)

If opening your **Railway public URL** shows the **MetroVision marketing/UI**, that service is running the **wrong app** (e.g. repo root / Next). The ingest worker is the small Express app under **`worker/`** and should show **JSON** at `/`, not HTML.

Do this **once** for the **worker** service:

1. **Settings → Source:** same GitHub repo and branch you use for Vercel (usually `main`).
2. **Settings → Root Directory:** `worker` (folder that contains `worker/package.json` and `worker/src/server.ts`).
3. **Settings → Config as Code (optional but recommended):** set the file path to **`worker/railway.toml`** so builds use **Railpack** and `npm start`. There is **no** `worker/Dockerfile` in-repo (it could not see monorepo `src/`). For a manual Docker image from the **repo root**, use **`docker/metrovision-worker.Dockerfile`**.
4. **Settings → Deploy:** start command should be **`npm start`** (overridden by `railway.toml` if the config file is active).
5. **Redeploy** the service, then verify in a browser:
   - `https://<railway-host>/` → `{"service":"metrovision-worker","status":"ok"}`
   - `https://<railway-host>/health` → JSON with `metrovision-worker`
6. Copy that origin into Vercel as **`NEXT_PUBLIC_WORKER_URL`** (no path). Redeploy Vercel after changing `NEXT_PUBLIC_*`.

**Auto-deploy:** ensure this service is set to deploy on pushes to your branch; narrow **watch paths** can skip builds when only `src/app/` changes—`worker/railway.toml` includes `worker/**` and shared `src/lib/**` / `src/db/**` so worker-related commits still trigger a deploy.

## Required for reliable prod ingest

1. **Set `INGEST_WORKER_URL`** (server-only, preferred) or **`NEXT_PUBLIC_WORKER_URL`** on Vercel to the worker **origin** only, e.g. `https://your-worker.railway.app` — no path, no trailing `/api`.
2. **Do not set** `METROVISION_DELEGATE_INGEST=0` unless you intentionally run ingest only on Next (not recommended for full films).
3. **On Vercel**, if ingest is not proxied to a worker and **`METROVISION_DELEGATE_INGEST` is not `0`**, `POST /api/ingest-film/stream` returns **503** with a JSON error instead of starting serverless ingest that will likely time out.
4. **Worker must expose** `GET /health` (JSON) and `POST /api/ingest-film/stream` (SSE), same contract as Next’s proxy.

## Long ingest without Vercel killing the SSE stream

Vercel’s route that **proxies** SSE to the worker can hit **duration / buffering / idle** limits. For reliable multi‑minute detect:

1. Set **`NEXT_PUBLIC_WORKER_URL`** on Vercel to the worker **origin** only (e.g. `https://your-service.up.railway.app`). If you paste a full path like `…/api/ingest-film/stream`, it is normalized to **origin** automatically — do not manually double the path.
2. Set **`NEXT_PUBLIC_INGEST_SSE_DIRECT=1`** on Vercel and **redeploy** (client bundle reads this at build time).
3. On the **worker**, allow your app origin in CORS: set **`ALLOWED_ORIGINS`** to a comma-separated list including your production URL (e.g. `https://your-app.vercel.app`), **or** set **`ALLOW_VERCEL_SUBDOMAINS=1`** for any `*.vercel.app` preview/production.
4. In the browser DevTools → Network, confirm **`POST …/api/ingest-film/stream`** goes to the **worker host**, not `your-app.vercel.app`.
5. On the **worker host** (Railway / Fly / nginx / Cloudflare): raise **read / idle timeouts** for long SSE (often 15–60+ minutes).

`GET /api/ingest-film/live-status` stays on Next (same-origin); only the **stream** is direct when the flag is on.

## Verify after deploy

- **Config (optional lock):** `GET /api/health/config`  
  - If `METROVISION_CONFIG_CHECK_SECRET` is set, send `Authorization: Bearer <secret>`.
  - Confirm `ingestWillProxyToWorker: true` and `workerHealth.ok: true` when a worker URL is configured.
- **Worker directly:** `GET {WORKER_ORIGIN}/health`

## Operational notes

- **Classify parallelism:** each shot runs **FFmpeg (libx264)** then **Gemini**. Default cap is **4** concurrent classifies (`resolveGeminiClassifyParallelism`) to avoid `Resource temporarily unavailable` / filter init failures on small workers (e.g. Railway). Raise with **`METROVISION_CLASSIFY_CONCURRENCY`** (e.g. `10`) on larger hosts.
- **Neon + S3 + Gemini** must be present in both Vercel and the worker env where ingest runs (worker needs `DATABASE_URL`, keys, etc.).
- **Idle timeouts:** the app emits periodic SSE during prep/detect so proxies are less likely to close the stream; if drops persist, confirm worker logs and Vercel function duration limits.

## Re-ingest behavior

When ingest reaches the **group** step, it **deletes** existing `pipeline_jobs` and `batch_jobs` for that film, then **all shots** (cascading metadata, embeddings, verifications, etc.) and **scenes**, then writes fresh rows. The **`films`** row is kept and updated. This avoids orphan scenes from interrupted runs.

Each ingest creates a row in **`ingest_runs`** (`status`, `stage`, counts, errors) for observability. Apply migration `drizzle/0008_ingest_runs.sql` (or `pnpm db:push`) so the table exists before deploying this behavior.

## Cost and runaway protection (Phase 5)

- **Concurrency** on the ingest form caps parallel Gemini/FFmpeg work; keep it aligned with your API tier (see rate limiter / AC-07).
- **Timeline window** (`ingestStartSec` / `ingestEndSec`): when either bound is set, the worker/Next ingest path **FFmpeg-extracts that segment to a temp file** and runs **PySceneDetect / FFmpeg scene on that segment only** (not the whole feature). Clip extraction and Gemini classification still seek on the **original** full source using film-absolute timecodes. If **only** `ingestStartSec` is set, **`ingestEndSec` is required** when duration cannot be probed (or omit both fields for full-file ingest).
- **Worker + HTTP(S) source:** if the probed duration is longer than the timeline window, the worker **skips the full-file remux** and keeps the URL as `sourceVideoPath` so prep is a quick probe plus segment extract (no whole-movie copy to disk first). Full-file ingest without a window still remuxes the entire object locally as before.
- For very large films, prefer the **Python batch pipeline** or raising worker resources over unbounded interactive runs.
