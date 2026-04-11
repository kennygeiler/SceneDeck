# Technology Stack

**Analysis Date:** 2026-04-11

## Languages

**Primary:**

- **TypeScript** — Application (`src/`), API routes, scripts (`scripts/`), shared libs imported by the worker (`worker/` pulls selected files from `../src/lib/` and `../src/db/schema.ts` per `worker/tsconfig.json`).
- **Python 3** — Offline / CLI pipeline (`pipeline/`), invoked from root via `pnpm batch-worker` → `python3 -m pipeline.batch_worker` (`package.json`).

**Secondary:**

- **SQL** — Managed through Drizzle schema and migrations (`src/db/schema.ts`, `drizzle/`).
- **CSS** — Tailwind CSS 4 utilities; tokens in `src/styles/tokens.css`.

## Runtime

**Environment:**

- **Node.js** `20.x` — Declared in `package.json` and `worker/package.json` `engines`; CI uses Node 20 (`.github/workflows/ci.yml`).

**Package Manager:**

- **pnpm** `9` — CI uses `pnpm/action-setup@v4` with `version: 9`; workspace in `pnpm-workspace.yaml` includes package `worker`.
- **Lockfile:** `pnpm-lock.yaml` at repo root.

## Frameworks

**Core:**

- **Next.js** `15.5.12` — App Router app under `src/app/`; config `next.config.ts` (ffmpeg trace includes, `serverExternalPackages`, `experimental.serverActions.bodySizeLimit`, remote image patterns).
- **React** `19.2.3` / **react-dom** `19.2.3` — UI and RSC/client components.
- **Express** `^5.1.0` — Ingest / boundary worker (`worker/src/server.ts`).
- **Drizzle ORM** `^0.45.1` — Schema `src/db/schema.ts`; Neon HTTP driver via `drizzle-orm/neon-http` in `src/db/index.ts`.

**UI / visualization:**

- **Tailwind CSS** `^4` with `@tailwindcss/postcss` — `postcss.config.mjs`.
- **shadcn/ui** stack — `@base-ui/react`, `class-variance-authority`, `tailwind-merge`, `lucide-react`, `tw-animate-css` (`package.json`).
- **D3** `^7.9.0` — Dashboard visualizations (`src/components/visualize/`).
- **Framer Motion** `^12.36.0` — Motion in UI where used.

**ML / browser (app):**

- **TensorFlow.js** `^4.22.0` + **@tensorflow-models/coco-ssd** `^2.2.3` — Client-side object detection paths (`package.json`).

**Testing:**

- **Vitest** `^3.2.4` — `devDependencies` in `package.json`; config `vitest.config.ts` (`environment: "node"`, `include: ["src/**/*.test.ts"]`, `@` → `./src` alias).

**Build / dev tooling:**

- **TypeScript** `^5` — `tsconfig.json` (app), `worker/tsconfig.json` (worker + shared imports).
- **tsx** `^4.21.0` — Script runner (`db:seed`, `check:*`, eval scripts, etc.).
- **drizzle-kit** `^0.31.9` — Migrations / studio (`drizzle.config.ts`).
- **esbuild** `^0.25.9` — Worker production bundle (`worker/package.json` `build` script → `dist/server.mjs`).
- **ESLint** `^9` with **eslint-config-next** `15.5.12` — Flat config `eslint.config.mjs` (extends `next/core-web-vitals`, `next/typescript`; ignores `worker/**`, `pipeline/**`).

**Python pipeline (`pipeline/requirements.txt`):**

- `scenedetect[opencv]` — Shot / scene boundary detection CLI integration.
- `google-generativeai` — Gemini classification (`pipeline/classify.py` and related).
- `anthropic` — Optional / alternate LLM client where wired.
- `httpx` — HTTP client.
- `python-dotenv` — Local env loading.
- `ffmpeg-python` — FFmpeg orchestration from Python.
- `psycopg2-binary` — Postgres writes (`pipeline/write_db.py`).

**Optional Python add-on:**

- `pipeline/requirements-transnet.txt` — `transnetv2-pytorch>=1.0.5` for TransNet V2–based cuts (large dependency; separate venv install).

**System / bundled binaries:**

- **ffmpeg-static** `^5.3.0` — Bundled ffmpeg for Node ingest paths (`postinstall`: `scripts/ensure-ffmpeg-static.cjs`); overrides via `FFMPEG_PATH` / `FFMPEG_BIN` / `FFPROBE_PATH` in `src/lib/ffmpeg-bin.ts`.

## Key Dependencies

**Critical (product paths):**

- `@neondatabase/serverless` `^1.0.2` + `drizzle-orm` — Serverless Postgres access (`src/db/index.ts`, `worker/src/db.ts`).
- `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` `^3.1015.0` — Media upload and signed URLs (`src/lib/s3.ts`, `worker/src/s3.ts`).
- `next` / `react` / `react-dom` — Host app and APIs.
- `openai` `^6.29.0` — Embeddings and RAG retrieval paths (`src/lib/openai-embedding.ts`, `src/app/api/search/route.ts`, `src/app/api/rag/route.ts`, corpus scripts).
- `replicate` `^1.4.0` — CLIP / YOLO-style models for image embeddings and enrichment (`src/lib/image-embedding.ts`, `src/lib/object-detection.ts`).

**Infrastructure / DX:**

- `cors` (worker), `express` (worker).
- `ffmpeg-static` (root + worker).

## Configuration

**Environment:**

- Loaded in app DB layer via `src/db/load-env.ts` (used by `src/db/index.ts`, `drizzle.config.ts`). Do not commit secrets; `.env` presence is expected locally (not read for this doc).

**Build / tooling files:**

- `next.config.ts` — Next build and serverless trace rules.
- `drizzle.config.ts` — Schema path `./src/db/schema.ts`, output `./drizzle`, PostgreSQL dialect.
- `vitest.config.ts` — Unit tests under `src/**/*.test.ts`.
- `tsconfig.json` — Path alias `@/*` → `./src/*`.
- `eslint.config.mjs` — Lint scope for app; worker/pipeline excluded from this flat config.
- `postcss.config.mjs` — PostCSS pipeline for Tailwind 4.

## Platform Requirements

**Development:**

- Node 20 + pnpm 9.
- Python 3 + venv for `pipeline/` (`pip install -r pipeline/requirements.txt`).
- PySceneDetect CLI on PATH unless overridden (`SCENEDETECT_PATH` in `src/lib/ingest-pipeline.ts`).
- Optional: `METROVISION_*` and cloud keys as documented in `AGENTS.md` / integration docs.

**Production:**

- **Vercel** — Typical Next.js deploy target (CI sets `NEXT_PUBLIC_SITE_URL` to `https://metrovision.vercel.app` for build); long-running ingest uses separate worker host (Express) per architecture constraints in `AGENTS.md`.
- **Neon PostgreSQL** — Primary database; `pgvector` column types in `src/db/schema.ts` for embeddings.

## Root scripts (reference)

Defined in `package.json`: `dev`, `build`, `start`, `lint`, `test` (Vitest), `check:schema-drift`, `check:taxonomy`, `check:worker`, `db:*`, eval/detect scripts, `batch-worker`.

**Worker scripts** (`worker/package.json`): `dev` (tsx watch), `build` (esbuild bundle), `start` (node `dist/server.mjs`), `typecheck`, `db:clear` (delegates to root).

---

*Stack analysis: 2026-04-11*
