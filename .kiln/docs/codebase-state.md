<!-- status: complete -->
# Codebase State

## TL;DR
Current milestone: M1 (Foundation Repair). Doc alignment pass 2026-04 — Kiln inventory matches live `src/app/api/**` and package.json; legacy `detect-shots` Next route absent (AC-23). Key files: `src/db/schema.ts`, `package.json`, `worker/src/ingest.ts`.
Last change: Phase 01 documentation & constraint alignment.

## Milestone: M1 — Foundation Repair
Status: not started

### Deliverables
- [x] bullmq and ioredis removed from package.json — not present in root `package.json` (verified)
- [x] Vercel Blob references removed from root app — `@vercel/blob` not in `package.json`; no `src/app/api/blob/` route (legacy path retired)
- [ ] Worker directory migrated from npm to pnpm workspace — worker/ has its own package.json with npm lockfile; pnpm-workspace.yaml exists at root but worker not yet integrated
- [x] AWS SDK version aligned between root and worker — both use `@aws-sdk/client-s3` / presigner `^3.1015.0` (verified 2026-04)
- [ ] TensorFlow.js/COCO-SSD evaluated and removed if not actively used — @tensorflow/tfjs ^4.22.0 and @tensorflow-models/coco-ssd ^2.2.3 in root package.json; used by src/components/video/realtime-object-overlay.tsx and src/hooks/use-realtime-detection.ts
- [ ] Token-bucket rate limiter in TS worker for Gemini calls — not implemented
- [ ] Asyncio rate limiter in Python pipeline — not implemented
- [x] AC-23 (legacy detect-shots): `src/app/api/detect-shots/route.ts` is **absent**; interactive single-film ingest uses `src/app/api/ingest-film/stream` and the TS worker — do not reintroduce the Next.js shell-out route
- [ ] review-splits page moved inside (site) route group — src/app/review-splits/page.tsx exists outside (site) group
- [x] Package name: root `package.json` `name` is `metrovision`; worker `package.json` `name` is `metrovision-worker`
- [ ] Taxonomy slug assertion in Python pipeline — not implemented in pipeline/

### Notes
- DB schema has 9 tables: films, scenes, shots, shotMetadata, shotSemantic, verifications, shotEmbeddings, shotObjects, pipelineJobs
- Architecture doc may mention older table counts; schema is source of truth in `src/db/schema.ts`
- drizzle-orm `^0.45.1` — AC-14 updated to match (Phase 01)
- src/lib/queue.ts and src/lib/queue-workers.ts exist (verify BullMQ usage vs AC-06)
- Batch review API: `src/app/api/batch/review/route.ts` (used by verify batch UI; source/submit/status admin routes removed)

## Milestone: M2 — Batch Pipeline Infrastructure
Status: not started

### Deliverables
- [ ] batch_jobs table in Postgres — pipelineJobs table exists but is not the batch_jobs spec from master plan
- [ ] Gemini Batch API prototype (AC-24 gate)
- [ ] Python batch worker with SKIP LOCKED
- [ ] Multi-process orchestration at film level
- [ ] Graceful shutdown and resume
- [ ] Job submission endpoint
- [ ] Operator tooling for batch job submission — use worker/Python pipeline; in-app admin panel removed
- [ ] Two-lane architecture documented (AC-20)

## Milestone: M3 — Dataset Scale to 500 Films
Status: not started

### Deliverables
- [ ] 500+ films sourced and queued
- [ ] Batch worker run against 500-film queue
- [ ] HITL review pipeline hardened
- [ ] 85% classification accuracy achieved
- [ ] Embeddings for all classified shots

## Milestone: M4 — Web Application and Hero Features
Status: not started (some UI already exists from prior work)

### Deliverables
- [ ] Film browse landing page — src/app/(site)/browse/page.tsx exists (partial, uses mock data)
- [ ] Film detail page — src/app/(site)/film/[id]/page.tsx exists (partial)
- [ ] Scene detail page — not yet
- [ ] Shot detail page — src/app/(site)/shot/[id]/page.tsx exists (partial)
- [ ] Metadata overlay hero feature — src/components/video/metadata-overlay.tsx exists (SVG-based, partial)
- [ ] Semantic search — src/app/api/search/route.ts exists (partial)
- [ ] URL param filter state — not verified
- [ ] Data export — src/app/(site)/export/page.tsx and src/components/export/ exist (partial)
- [ ] Reference deck creation
- [ ] D3 visualizations — 6 components exist: rhythm-stream, hierarchy-sunburst, pacing-heatmap, chord-diagram, composition-scatter, director-radar

## Milestone: M5 — RAG Intelligence Layer
Status: not started

## Milestone: M6 — Chat Interface with Generative UI
Status: **retired** — product chat / generative UI routes and libs removed; optional `POST /api/rag` remains for retrieval + Q&A without a dedicated chat page.

## Milestone: M7 — API Portal and ComfyUI Integration
Status: not started

## Module Inventory

### Next.js App (src/)
- **Pages**: layout.tsx, page.tsx (home), browse/, film/[id]/, shot/[id]/, verify/, verify/[shotId]/, export/, visualize/, tuning/, ingest/, review-splits/ (outside route group)
- **API Routes**: `batch/review`, `detect-objects`, `eval/*`, `export`, `export/shots`, `group-scenes`, `health/config`, `ingest-film`, `ingest-film/stream`, `ingest-film/live-status`, `process-scene`, `rag`, `s3`, `s3/presign-get`, `search`, `shots`, `shots/[id]/*`, `tmdb/*`, `upload-to-s3`, `upload-video`, `verifications`, `verifications/[shotId]`, `v1/films`, `v1/search`, `v1/shots`, `v1/taxonomy` (no `detect-shots`, no `blob/[...path]`)
- **Components**: video/ (shot-player, metadata-overlay, object-overlay, realtime-object-overlay), shots/ (shot-card, shot-browser, detect-objects-button), films/ (film-card, film-header, film-coverage-stats, film-timeline, scene-card, film-browser), visualize/ (6 D3 charts + viz-dashboard), eval/ (gold-annotate), export/ (export-button, export-panel), verify/ (verification-panel, verification-history), review/ (review-splits-workspace), layout/ (site-shell, site-header), home/ (home-hero), ingest/ (pipeline-viz), archive/, ui/ (button, loading-skeleton)
- **Lib**: taxonomy.ts, types.ts, utils.ts, shot-display.ts, tmdb.ts, s3.ts, export.ts, archive-org.ts, object-detection.ts, timeline-colors.ts, verification.ts, validation-rules.ts, ingest-pipeline.ts, rag-retrieval.ts, llm-route-gate.ts, queue.ts, queue-workers.ts, mock/shots.ts
- **DB**: schema.ts (9 tables), index.ts, queries.ts, generate-embeddings.ts, generate-scene-embeddings.ts, ingest-corpus.ts, seed.ts, load-env.ts

### TS Ingest Worker (worker/)
- server.ts (Express), ingest.ts (pipeline logic), s3.ts, db.ts, schema.ts
- Has own package.json with npm (not pnpm workspace)

### Python Pipeline (pipeline/)
- main.py, classify.py, config.py, detect_region.py, extract_clips.py, shot_detect.py, taxonomy.py, upload_blob.py, validate_gemini.py, write_db.py, requirements.txt

### Config
- drizzle.config.ts, next.config.ts, eslint.config.mjs, postcss.config.mjs, pnpm-workspace.yaml, components.json
