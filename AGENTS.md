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
pnpm check:schema-drift  # App vs worker Drizzle columns for shared tables (see scripts/check-schema-drift.ts)
pnpm check:taxonomy      # src/lib/taxonomy.ts vs pipeline/taxonomy.py (AC-02)
pnpm test                # Vitest (unit tests; CI runs this too)

# TS Ingest Worker (Express, runs separately)
cd worker && pnpm dev   # Start worker dev server (tsx watch)
cd worker && pnpm build # TypeScript compile

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
src/components/visualize/rhythm-stream.tsx
src/components/visualize/hierarchy-sunburst.tsx
src/components/visualize/pacing-heatmap.tsx
src/components/visualize/chord-diagram.tsx
src/components/visualize/composition-scatter.tsx
src/components/visualize/director-radar.tsx

# AI Agent
src/lib/agent-system-prompt.ts        -- Agent system prompt
src/lib/agent-tools.ts                -- Agent tool definitions
src/app/api/agent/chat/route.ts       -- Chat SSE endpoint
src/components/agent/chat-interface.tsx -- Chat UI

# TS Ingest Worker
worker/src/server.ts                  -- Express server entry
worker/src/ingest.ts                  -- Film ingest pipeline (SSE, Gemini, TMDB, S3)
worker/src/s3.ts                      -- S3 upload utilities
worker/src/db.ts                      -- Worker DB client
worker/src/schema.ts                  -- Worker schema copy

# Python Pipeline
pipeline/main.py                      -- CLI entry point
pipeline/classify.py                  -- Gemini classification
pipeline/shot_detect.py               -- PySceneDetect wrapper
pipeline/extract_clips.py             -- FFmpeg frame/clip extraction
pipeline/write_db.py                  -- Postgres writes

# Config
package.json                          -- Root deps (`name`: metrovision)
worker/package.json                   -- Worker deps (`name`: metrovision-worker; npm, not pnpm workspace)
drizzle.config.ts                     -- Drizzle Kit config
pnpm-workspace.yaml                   -- Workspace config (worker not yet integrated)
.github/workflows/ci.yml              -- CI: lint, taxonomy, schema-drift, test
vitest.config.ts                      -- Unit tests (`src/lib/__tests__/`)

# Architecture (read-only reference)
.kiln/master-plan.md                  -- 7-milestone build plan (M1-M7)
.kiln/docs/architecture.md            -- System architecture
.kiln/docs/arch-constraints.md        -- 24 hard constraints (AC-01 through AC-24)
.kiln/docs/tech-stack.md              -- All technologies with versions
.kiln/docs/decisions.md               -- 16 ADRs
.kiln/docs/codebase-state.md          -- Living inventory (rakim)
```

## Rate limits & ingest boundaries (AC-07, AC-20)

- **Gemini (AC-07):** `acquireToken()` from `src/lib/rate-limiter.ts` (~130 RPM token bucket) runs before Gemini HTTP calls in `ingest-pipeline.ts`, `object-detection.ts` (enrichment), `api/agent/chat`, and `api/rag`. The TS ingest **worker** mirrors the same limits in `worker/src/rate-limiter.ts` for shot classification.
- **Semantic search:** `src/db/queries.ts` `searchShots` uses pgvector when `shot_embeddings` has data; otherwise or on failure it falls back to ILIKE. Logs are prefixed **`[searchShots]`** — monitor in production; run `pnpm db:embeddings` to populate vectors after ingest.
- **Canonical long-running ingest:** Use the **Express worker** (`worker/`, SSE) or **Python pipeline** (`pipeline/`) for film-scale jobs. **`/api/process-scene`** is **off on Vercel**; **`/api/ingest-film/stream`** still targets a full Node host with local `videoPath` and is not a substitute for the worker on small serverless timeouts.

## Production hardening (public deploys)

Optional env vars (see `.planning/codebase/INTEGRATIONS.md`):

- **`METROVISION_LLM_GATE_SECRET`** — If set, `POST /api/agent/chat` and `POST /api/rag` require header **`x-metrovision-llm-gate`** with the same value (reduces anonymous Gemini/OpenAI spend).
- **`METROVISION_PROCESS_SCENE_SECRET`** — If set, `POST /api/process-scene` requires **`x-metrovision-process-scene-secret`**. The route is **disabled on Vercel** (`503`); use the worker ingest path for hosted workflows.
- **`METROVISION_ALLOW_API_KEY_QUERY`** — Set to `true` only to temporarily allow v1 API keys via `?api_key=`; prefer Bearer.

## Known Issues

(None — Phase 01 aligned AC-14 and agent docs with `^0.45.1`.)
