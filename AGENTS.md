# AGENTS.md

## Commands

```bash
# Web app (Next.js 15 + React 19)
pnpm dev              # Start Next.js dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm start            # Start production server

# Database (Drizzle ORM + Neon Postgres)
pnpm db:generate      # Generate Drizzle migrations
pnpm db:push          # Push schema to Neon
pnpm db:seed          # Seed database (tsx src/db/seed.ts)
pnpm db:clear         # TRUNCATE films + CASCADE (dev reset). Requires CONFIRM_CLEAR=yes. Run from **repo root** (or `cd worker && pnpm db:clear` delegates to root).
pnpm db:embeddings    # Generate shot embeddings (tsx src/db/generate-embeddings.ts)
pnpm db:studio        # Open Drizzle Studio
pnpm check:schema-drift  # Ingest-related Drizzle tables present (`src/db/schema.ts` shared with worker)
pnpm check:taxonomy      # src/lib/taxonomy.ts vs pipeline/taxonomy.py (AC-02)
pnpm test                # Vitest (unit tests; CI runs this too)

# TS Ingest Worker (Express, runs separately)
cd worker && pnpm dev   # Start worker dev server (`node --import tsx/esm --watch`)
cd worker && pnpm build # `tsc --noEmit` (worker imports `../../src/lib/*` at runtime via tsx loader)

# Python pipeline
cd pipeline
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py          # Run pipeline CLI
```

## Architecture TL;DR

MetroVision (SceneDeck) is a **shot-level composition archive** at cinematic scale: per-shot **framing, depth, blocking, symmetry, dominant lines, lighting, color temperature, shot size, camera angle, and duration category** (`shot_metadata`), plus semantic text (`shot_semantic`), optional **detections** (`shot_objects`), **human verifications** (`verifications`), and **pgvector** search when embeddings exist. The **legacy camera-movement taxonomy** (movement types, directions, speeds) was **removed** from the shared taxonomy; see comments at the bottom of `src/lib/taxonomy.ts`.

Stack: Next.js 15 App Router (TypeScript, Tailwind CSS 4, shadcn/ui) on Vercel, Neon PostgreSQL + Drizzle. Two-lane ingest: **TS Express worker** (interactive film ingest + SSE) and **Python pipeline** (PySceneDetect + Gemini). Six **D3** visualization panels. **AI chat** with SSE tool calls. **AWS S3** for media. **CI** (`.github/workflows/ci.yml`): `lint`, `check:taxonomy`, `check:schema-drift`, `test` — `build` expects `DATABASE_URL` where prerender hits the DB.

## Conventions

- **Framework**: Next.js 15 App Router only (no Pages Router). Server Components for data fetching, Client Components (`"use client"`) only for interactivity. Do not call **`buttonVariants()`** (from `@/components/ui/button`, a client module) from Server Components — extract a small client child or use plain `className`s.
- **Styling**: Tailwind CSS 4 utility classes. OKLCH design tokens in `src/styles/tokens.css`. Dark cinematic theme.
- **Components**: shadcn/ui base library in `src/components/ui/`. Radix UI primitives underneath.
- **Database**: Drizzle ORM with `@neondatabase/serverless` HTTP driver. Always import `db` from `src/db/index.ts` (AC-04). Use drizzle-orm `^0.45.1` (AC-14). Prefer builder API `db.select().from().where()`.
- **Taxonomy**: **Composition** slugs in `src/lib/taxonomy.ts` and `pipeline/taxonomy.py` — must stay in sync (AC-02). Do not reintroduce removed movement/direction/speed enums without a migration and parity update.
- **File organization**: App Router conventions. Components in `src/components/` by domain. Route group `(site)` for public pages.
- **Naming**: kebab-case files, PascalCase components, camelCase functions/variables.
- **Display helpers**: Use `src/lib/shot-display.ts` for taxonomy display names. Do not duplicate lookups.
- **Rate limiting**: Required on all Gemini API calls in both TS and Python (AC-07).
- **No auth**: Public access, API keys only for API portal (AC-21).
- **No BullMQ/Redis**: Job queue is Postgres SKIP LOCKED (AC-06).
- **Media storage**: AWS S3 with pre-signed URLs. Vercel Blob is deprecated (ADR-010).
- **No video processing in Vercel serverless**: 60s timeout (AC-01).

## Key Files

```
# Core Schema & Data
src/db/schema.ts                      -- 9 Drizzle tables (films, scenes, shots, shotMetadata, shotSemantic, verifications, shotEmbeddings, shotObjects, pipelineJobs)
src/db/index.ts                       -- Singleton Drizzle client (import db from here)
src/db/queries.ts                     -- Database query functions
src/lib/taxonomy.ts                   -- Composition taxonomy constants + types (framing, depth, blocking, …)
pipeline/taxonomy.py                  -- Python taxonomy mirror (must match TS)
src/lib/archive-trust.ts              -- Labels for provenance / trust copy (no DB)

# Pages
src/app/(site)/page.tsx               -- Landing page with hero
src/app/(site)/browse/page.tsx        -- Film/shot browse with filters
src/app/(site)/film/[id]/page.tsx     -- Film detail page
src/app/(site)/shot/[id]/page.tsx     -- Shot detail with metadata overlay
src/app/(site)/verify/page.tsx        -- HITL verification queue
src/app/(site)/agent/page.tsx         -- AI chat interface
src/app/(site)/visualize/page.tsx     -- D3 visualization dashboard
src/app/(site)/ingest/page.tsx        -- Film ingest UI
src/app/(site)/admin/page.tsx         -- Admin panel
src/app/(site)/export/page.tsx        -- JSON/CSV export + citation block

# Landing / trust / demo (composition wedge)
src/components/archive/archive-demo-slice.tsx      -- Server: demo path + methodology
src/components/archive/archive-demo-slice-actions.tsx -- Client: CTA links (`buttonVariants`)
src/components/archive/methodology-blurb.tsx
src/components/archive/shot-provenance-card.tsx
src/components/export/export-citation-panel.tsx

# Hero Feature
src/components/video/metadata-overlay.tsx -- SVG composition overlay (badges: framing, depth, blocking, shot size, lighting, angles, duration)
src/components/video/shot-player.tsx   -- Video player with overlay toggle

# Visualizations (D3)
src/lib/viz-colors.ts                     -- Stable hues for framing / category slugs (viz)
src/lib/viz-shot-map.ts                   -- Row → VizShot defaults (shared with `getVisualizationData`)
src/components/visualize/viz-dashboard.tsx -- Compose filters + section IA for `/visualize`
src/components/visualize/staging-heatmap.tsx
src/components/visualize/lighting-grid.tsx
src/components/visualize/angle-profile.tsx
src/components/visualize/duration-category-chart.tsx
src/components/visualize/duration-ridgeline.tsx
src/components/visualize/chord-diagram.tsx
src/components/visualize/composition-scatter.tsx
src/components/visualize/director-radar.tsx
src/components/visualize/rhythm-stream.tsx
src/components/visualize/hierarchy-sunburst.tsx
src/components/visualize/pacing-heatmap.tsx

# AI Agent
src/lib/agent-system-prompt.ts        -- Agent system prompt
src/lib/agent-tools.ts                -- Agent tool definitions
src/app/api/agent/chat/route.ts       -- Chat SSE endpoint
src/components/agent/chat-interface.tsx -- Chat UI

# TS Ingest Worker
worker/src/server.ts                  -- Express server entry
worker/src/ingest.ts                  -- Film ingest SSE handler (delegates to `src/lib/ingest-pipeline.ts` + app schema)
worker/src/s3.ts                      -- S3 upload utilities (legacy; pipeline uses `src/lib/s3.ts` via ingest-pipeline)
worker/src/db.ts                      -- Drizzle client; schema from `src/db/schema.ts`

# Python Pipeline
pipeline/main.py                      -- CLI entry point
pipeline/classify.py                  -- Gemini classification
pipeline/shot_detect.py               -- PySceneDetect wrapper (+ env ensemble parity with TS)
pipeline/transnet_cuts.py             -- Optional TransNet V2 → cuts JSON (`requirements-transnet.txt`)
pipeline/extract_clips.py             -- FFmpeg frame/clip extraction
pipeline/write_db.py                  -- Postgres writes
eval/gold/template.json               -- Gold eval file shape (boundaries + optional shots/slots)
scripts/eval-pipeline.ts              -- Boundary (F1) + optional slot accuracy vs gold JSON
scripts/export-film-eval.ts           -- Export a film’s DB shots to predicted JSON for eval

# Config
package.json                          -- Root deps (`name`: metrovision)
worker/package.json                   -- Worker deps (`name`: metrovision-worker; workspace package)
drizzle.config.ts                     -- Drizzle Kit config
pnpm-workspace.yaml                   -- Workspace includes root app + `worker`
.github/workflows/ci.yml              -- CI: lint, taxonomy, schema-drift, test
vitest.config.ts                      -- Unit tests (`src/lib/__tests__/`)

# Planning (pipeline proof points)
.planning/research/pipeline-whitepaper.md    -- Pipeline stages, tech, inputs/outputs, fidelity limits
.planning/research/ingest-accuracy-hitl-strategy.md -- Product stance, HITL, upgrade roadmap

# Architecture (read-only reference)
.kiln/master-plan.md                  -- 7-milestone build plan (M1-M7)
.kiln/docs/architecture.md            -- System architecture
.kiln/docs/arch-constraints.md        -- 24 hard constraints (AC-01 through AC-24)
.kiln/docs/tech-stack.md              -- All technologies with versions
.kiln/docs/decisions.md               -- 16 ADRs
.kiln/docs/codebase-state.md          -- Living inventory (rakim)
```

## Rate limits & ingest boundaries (AC-07, AC-20)

- **Ingest classification models:** `GEMINI_CLASSIFY_MODEL` (default `gemini-2.5-flash`) and optional `GEMINI_ADJUDICATE_MODEL` (second pass on JSON parse failure, e.g. `gemini-2.5-pro`). **Shot boundaries (Phase D):** `METROVISION_BOUNDARY_DETECTOR` — default `pyscenedetect_cli` (single PySceneDetect run, `content` or `adaptive` from request); set to `pyscenedetect_ensemble_pyscene` for dual PySceneDetect + NMS (matches Python `pipeline/shot_detect.py` when the same env is set). Optional **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`** (path to JSON array of cut times in seconds, e.g. offline TransNet). **`METROVISION_BOUNDARY_MERGE_GAP_SEC`** (default `0.35`) merges nearby cuts. **Long-shot triage:** `METROVISION_LONG_SHOT_REVIEW_SECONDS` (default `90`) sets `review_status` to `needs_review` for automated long takes and for `gemini_fallback` rows.
- **Visual similarity (Phase D):** Table `shot_image_embeddings` (768-d CLIP via Replicate). **`pnpm db:embeddings:image`** requires **`REPLICATE_API_TOKEN`**, public **`NEXT_PUBLIC_SITE_URL`** (so `/api/s3` thumbnail URLs resolve), and optional **`REPLICATE_CLIP_EMBEDDING_MODEL`**. **`GET /api/shots/[id]/similar-visual`** returns nearest neighbors by cosine distance.
- **TransNet cuts → ingest:** In `pipeline/.venv`, `pip install -r requirements-transnet.txt`, then `python -m pipeline.transnet_cuts /path/film.mp4 -o cuts.json`. **Worker / ingest JSON** accepts **`extraBoundaryCuts`: number[]** (merged with **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`**). Prefer **`METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene`** so PyScene and TransNet cuts fuse via NMS.
- **Eval (gold vs predicted):** Human writes **`eval/gold/<film>.json`** (`cutsSec`, optional `shots` with `framing` / `shotSize`). Ran hand-cut convention: **`eval/gold/gold-ran-2026-04-10.json`** (copy from local machine into repo; see **`eval/gold/README.md`**). Predicted boundaries: **`pnpm eval:export-film -- <filmId>`** (from DB) or **`pnpm detect:export-cuts -- <videoPath>`** (detect-only, no DB/Gemini; optional `--gold`, `--ledger`, timeline `--start`/`--end`). **`pnpm eval:pipeline -- eval/gold/foo.json eval/predicted/foo.json --tol 0.5 --slots`** prints precision/recall/F1 and optional slot accuracy. Run log: **`eval/runs/README.md`** / **`ledger.jsonl`**. **`/eval/gold-annotate`** can **save gold/predicted JSON to Postgres** (`eval_artifacts`); retrieval is **`GET /api/eval/artifacts/<id>?t=<token>`** (token shown once on create). See **`METROVISION_EVAL_ARTIFACT_ADMIN_SECRET`** under Production hardening.
- **Gemini (AC-07):** `acquireToken()` from `src/lib/rate-limiter.ts` (~130 RPM token bucket) runs before Gemini HTTP calls in `ingest-pipeline.ts` (used by Next ingest stream **and** the Express worker), `object-detection.ts` (enrichment). `api/agent/chat` and `api/rag` should align with the same limiter where they call Gemini.
- **Semantic search:** `src/db/queries.ts` `searchShots` uses pgvector when `shot_embeddings` has data; otherwise or on failure it falls back to ILIKE. Logs are prefixed **`[searchShots]`** — monitor in production; run `pnpm db:embeddings` to populate vectors after ingest.
- **Canonical long-running ingest:** Use the **Express worker** (`worker/`, SSE) or **Python pipeline** (`pipeline/`) for film-scale jobs. **`/api/process-scene`** is **off on Vercel**; **`/api/ingest-film/stream`** still targets a full Node host with local `videoPath` and is not a substitute for the worker on small serverless timeouts.

## Production hardening (public deploys)

Optional env vars (see `.planning/codebase/INTEGRATIONS.md`):

- **`METROVISION_LLM_GATE_SECRET`** — If set, `POST /api/agent/chat` and `POST /api/rag` require header **`x-metrovision-llm-gate`** with the same value (reduces anonymous Gemini/OpenAI spend).
- **`METROVISION_PROCESS_SCENE_SECRET`** — If set, `POST /api/process-scene` requires **`x-metrovision-process-scene-secret`**. The route is **disabled on Vercel** (`503`); use the worker ingest path for hosted workflows.
- **`METROVISION_ALLOW_API_KEY_QUERY`** — Set to `true` only to temporarily allow v1 API keys via `?api_key=`; prefer Bearer.
- **`METROVISION_EVAL_ARTIFACT_ADMIN_SECRET`** — If set (required in **`NODE_ENV=production`** for uploads/list), **`POST /api/eval/artifacts`** and **`GET /api/eval/artifacts`** (metadata list) require **`Authorization: Bearer`** with the same value. Fetches **`GET /api/eval/artifacts/[id]?t=...`** use only the per-row token. Apply migration **`drizzle/0007_eval_artifacts.sql`** (or **`pnpm db:push`**).

## Known Issues

(None — Phase 01 aligned AC-14 and agent docs with `^0.45.1`.)
