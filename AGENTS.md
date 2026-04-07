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
pnpm db:embeddings    # Generate shot embeddings (tsx src/db/generate-embeddings.ts)
pnpm db:studio        # Open Drizzle Studio
pnpm check:schema-drift  # App vs worker Drizzle columns for shared tables (see scripts/check-schema-drift.ts)

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

MetroVision (SceneDeck) is a platform for structured camera movement analysis at cinematic scale. Next.js 15 App Router monolith (TypeScript, Tailwind CSS 4, shadcn/ui) on Vercel, with Neon PostgreSQL + pgvector for data and semantic search. Two-lane ingest pipeline: TS Express worker for interactive single-film ingestion with SSE streaming, and a Python pipeline for batch processing (PySceneDetect + Gemini classification). 6 D3 visualization components. AI chat agent with SSE tool-call streaming. AWS S3 for media storage. Camera movement taxonomy: 21 types, 15 directions, 7 speeds, 15 shot sizes, 15 angles, 6 durations.

## Conventions

- **Framework**: Next.js 15 App Router only (no Pages Router). Server Components for data fetching, Client Components (`"use client"`) only for interactivity.
- **Styling**: Tailwind CSS 4 utility classes. OKLCH design tokens in `src/styles/tokens.css`. Dark cinematic theme.
- **Components**: shadcn/ui base library in `src/components/ui/`. Radix UI primitives underneath.
- **Database**: Drizzle ORM with `@neondatabase/serverless` HTTP driver. Always import `db` from `src/db/index.ts` (AC-04). Use drizzle-orm `^0.45.1` (AC-14). Prefer builder API `db.select().from().where()`.
- **Taxonomy**: Fixed taxonomy in `src/lib/taxonomy.ts` (TS) and `pipeline/taxonomy.py` (Python). Must stay in sync (AC-02).
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
src/lib/taxonomy.ts                   -- Camera movement taxonomy constants + types (21 movement types)
pipeline/taxonomy.py                  -- Python taxonomy mirror (must match TS)

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

# Hero Feature
src/components/video/metadata-overlay.tsx -- SVG overlay: direction arrows, badges, trajectory
src/components/video/shot-player.tsx  -- Video player with overlay toggle

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

# Architecture (read-only reference)
.kiln/master-plan.md                  -- 7-milestone build plan (M1-M7)
.kiln/docs/architecture.md            -- System architecture
.kiln/docs/arch-constraints.md        -- 24 hard constraints (AC-01 through AC-24)
.kiln/docs/tech-stack.md              -- All technologies with versions
.kiln/docs/decisions.md               -- 16 ADRs
.kiln/docs/codebase-state.md          -- Living inventory (rakim)
```

## Production hardening (public deploys)

Optional env vars (see `.planning/codebase/INTEGRATIONS.md`):

- **`METROVISION_LLM_GATE_SECRET`** — If set, `POST /api/agent/chat` and `POST /api/rag` require header **`x-metrovision-llm-gate`** with the same value (reduces anonymous Gemini/OpenAI spend).
- **`METROVISION_PROCESS_SCENE_SECRET`** — If set, `POST /api/process-scene` requires **`x-metrovision-process-scene-secret`**. The route is **disabled on Vercel** (`503`); use the worker ingest path for hosted workflows.
- **`METROVISION_ALLOW_API_KEY_QUERY`** — Set to `true` only to temporarily allow v1 API keys via `?api_key=`; prefer Bearer.

## Known Issues

(None — Phase 01 aligned AC-14 and agent docs with `^0.45.1`.)
