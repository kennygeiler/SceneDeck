# Technology Stack

**Analysis Date:** 2026-04-07

## Languages

**Primary:**

- **TypeScript** — Application code for the Next.js app (`src/`), shared libraries (`src/lib/`), database layer (`src/db/`), and API routes (`src/app/api/`).
- **TypeScript** — Standalone ingest worker (`worker/src/`), compiled to `worker/dist/` with `tsc`.

**Secondary:**

- **Python 3** — Batch/video pipeline (`pipeline/`: detection, classification, DB writes, batch worker). Version not pinned in-repo (no `.python-version`); use a current 3.x with venv per `pipeline/requirements.txt`.
- **SQL** — Defined and migrated via Drizzle schema in `src/db/schema.ts`; Python path uses raw SQL through `psycopg2` in `pipeline/write_db.py`.

## Runtime

**Environment:**

- **Node.js** — Required for Next.js 15 and the Express worker. No `engines` field in root `package.json` and no `.nvmrc`; align with Next 15 / Vercel defaults (typically Node 20+).
- **Python interpreter** — Invoked as `python3` by default; overridable via `METROVISION_PYTHON_BIN` in `src/app/api/process-scene/route.ts`. Pipeline CLI and `pnpm batch-worker` (`python3 -m pipeline.batch_worker` per root `package.json`) expect Python on `PATH`.

**Package Manager:**

- **pnpm** — Root monorepo installs; lockfile: `pnpm-lock.yaml`.
- **Workspace:** `pnpm-workspace.yaml` includes `worker` as a package; the worker also has its own `worker/package.json` (install from repo root with pnpm or inside `worker/` per local workflow).

## Frameworks

**Core:**

- **Next.js** `15.5.12` — App Router monolith (`src/app/`). Config: `next.config.ts` (large server action body limit, permissive `images.remotePatterns`).
- **React** `19.2.3` — UI with Server and Client Components.
- **Express** `^5.1.0` — Ingest worker HTTP server (`worker/src/server.ts`).
- **Drizzle ORM** `^0.45.1` — Schema (`src/db/schema.ts`), queries (`src/db/queries.ts`), Kit for migrations (`drizzle-kit` `^0.31.9`).

**Testing:**

- Not detected — No `vitest`, `jest`, or `playwright` in root `package.json`; no first-party `*.test.*` / `*.spec.*` pattern cataloged for this stack document.

**Build/Dev:**

- **TypeScript** `^5` — `tsconfig.json` (root), `worker/tsconfig.json` (ES2022, `outDir` `dist`).
- **tsx** `^4.21.0` — Script runner (`db:embeddings`, `corpus:ingest`, worker `dev`).
- **ESLint** `^9` with **eslint-config-next** — `eslint.config.mjs` (flat config, `next/core-web-vitals`, `next/typescript`).
- **Tailwind CSS** `^4` with **@tailwindcss/postcss** — `postcss.config.mjs`, tokens/styles via `src/styles/globals.css` (see `components.json`).
- **shadcn/ui** — CLI dep `shadcn`; registry config in `components.json` (Base UI style `base-nova`, aliases under `@/`).

## Key Dependencies

**Critical:**

- `@neondatabase/serverless` `^1.0.2` + `drizzle-orm/neon-http` — Serverless Postgres HTTP driver; singleton in `src/db/index.ts`.
- `drizzle-orm` `^0.45.1` — ORM for app and worker (`worker/src/db.ts` uses Neon + Drizzle).
- `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` `^3.1015.0` — Media upload and signed URLs (`src/lib/s3.ts`, `worker/src/s3.ts`).
- `openai` `^6.29.0` — Embeddings and RAG-related flows (`src/db/embeddings.ts`, `src/lib/rag-retrieval.ts`, multiple API routes).
- `d3` `^7.9.0` — Visualization dashboards (`src/components/visualize/`).
- `@tensorflow/tfjs` / `@tensorflow-models/coco-ssd` — Client-side object detection path in the app (`src/lib/object-detection.ts` also integrates Replicate/Gemini).

**Infrastructure:**

- `express`, `cors` — Worker HTTP and CORS (`worker/src/server.ts`).
- `replicate` `^1.4.0` — Hosted model calls (e.g. YOLO path in `src/lib/object-detection.ts`).
- `framer-motion`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@base-ui/react` — UI and motion.

**Python (`pipeline/requirements.txt`):**

- `scenedetect[opencv]` — PySceneDetect (`pipeline/shot_detect.py`).
- `google-generativeai` — Declared; `pipeline/classify.py` imports `google.genai` (Google Gen AI SDK). Ensure the installed package matches import expectations when provisioning environments.
- `psycopg2-binary` — Direct Postgres writes (`pipeline/write_db.py`).
- `python-dotenv` — Loads repo-root `.env.local` from `pipeline/config.py`.
- `ffmpeg-python` — Present in requirements; `pipeline/shot_detect.py` also shells out to `ffprobe` / ffmpeg-style binaries — **FFmpeg/ffprobe must be installed on the host**.
- `anthropic`, `httpx` — Listed in `pipeline/requirements.txt`; no in-repo Python imports detected in `pipeline/*.py` at audit time (treat as optional or legacy unless needed).

## Configuration

**Environment:**

- Next app and Drizzle load optional local file via `src/db/load-env.ts`: reads **`.env.local`** at repo root (does not override existing `process.env` keys). `drizzle.config.ts` calls `loadLocalEnv()` before reading `DATABASE_URL`.
- Pipeline loads the same file explicitly: `pipeline/config.py` (`load_dotenv` on `REPO_ROOT / ".env.local"`).
- Worker relies on process environment (no shared `load-env` helper in `worker/src/`); set variables in the shell or deployment platform.
- **Do not commit secrets.** A template file `.env.example` exists at repo root (not read during this audit); discover required names from code paths below and from that template.

**Build:**

- `next.config.ts` — Next.js.
- `drizzle.config.ts` — Drizzle Kit (`schema` `./src/db/schema.ts`, migrations `drizzle/`).
- `tsconfig.json` — Path alias `@/*` → `./src/*`.
- `worker/tsconfig.json` — Worker compile to `worker/dist/`.
- `eslint.config.mjs` — Linting.
- `postcss.config.mjs` — Tailwind PostCSS plugin.
- `components.json` — shadcn/ui paths and Tailwind entry `src/styles/globals.css`.

## Platform Requirements

**Development:**

- Node.js + pnpm for the web app and worker TypeScript.
- Python 3 + venv, FFmpeg/ffprobe, and OpenCV-backed PySceneDetect for full pipeline runs.
- Optional: `scenedetect` CLI on PATH or `SCENEDETECT_PATH` for TS-side ingest (`src/lib/ingest-pipeline.ts`, `worker/src/ingest.ts`).

**Production:**

- **Vercel** — Implied by defaults such as `process.env.NEXT_PUBLIC_SITE_URL` fallback in `src/app/layout.tsx` and CORS defaults in `worker/src/server.ts` (`https://scene-deck.vercel.app`). Worker is a separate long-running Node process (not Vercel serverless) when using Express ingest.
- **Neon** — Serverless Postgres hosting for `DATABASE_URL`.
- **AWS** — S3 bucket for media (`AWS_*` variables in `src/lib/s3.ts` and `worker/src/s3.ts`).

---

*Stack analysis: 2026-04-07*
