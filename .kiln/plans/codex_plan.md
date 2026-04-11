# MetroVision Implementation Plan
**Planner**: miyamoto (codex_plan.md)
**Date**: 2026-03-25
**Priority Order**: P1 = Training infrastructure / pipeline / dataset scale | P2 = Visual-first product surfaces | P3 = Intelligence layer + integrations

---

## What Exists vs. What Needs to Be Built

### Already Built (Do Not Rebuild)
- Next.js 15 + React 19 + TypeScript frontend and API routes
- Drizzle ORM + Neon Postgres schema: films, scenes, shots, shot_embeddings, verifications tables
- pgvector extension and OpenAI shot-level embeddings (text-embedding-3-small, 768 dims)
- TypeScript ingest worker (Express, SSE streaming, TMDB, S3 upload, Gemini classification, embeddings)
- Python ingest pipeline (parallel dual implementation — partially functional)
- AWS S3 storage with pre-signed URL playback
- 6 D3 visualization components: RhythmStream, HierarchySunburst, PacingHeatmap, ChordDiagram, CompositionScatter, DirectorRadar
- TMDB metadata integration
- HITL verification workflow UI (shots verification queue with 0-5 rating)
- ~~SSE streaming infrastructure for product chat~~ — removed; RAG API remains for retrieval-backed Q&A
- Gemini 2.5 Flash classification (interactive path)
- Fixed camera movement taxonomy (21 movement types, 15 directions, 7 speeds, 15 shot sizes, 15 angles, 6 durations)
- shadcn/ui components throughout

### Must Be Built
- Python batch worker (Postgres SKIP LOCKED queue + Gemini Batch API JSONL)
- Gemini Batch API prototype validation for video-via-File-API (AC-24)
- Rate limiting in both TS worker and Python pipeline (currently absent — highest-urgency gap)
- Dead dependency removal: bullmq, ioredis, Vercel Blob references
- pnpm standardization across root + worker (migrate worker from npm)
- Pipeline: legacy detect-shots route stays absent; two-lane architecture (AC-20, AC-23)
- corpus_chunks, scene_embeddings, film_embeddings, batch_jobs Postgres tables
- Knowledge corpus ingestion pipeline (chunking, contextual enrichment, embedding)
- Hybrid retrieval engine (BM25 tsvector + pgvector + RRF fusion)
- RAG reasoning layer (Claude/Gemini as foundation model)
- Chat interface: connect tool_result payloads to D3 component rendering (Generative UI gap)
- Metadata overlay hero feature: Canvas + SVG + Framer Motion synchronized to video currentTime
- Film to scene to shot browse hierarchy with URL-param filter state
- API portal (REST endpoints for programmatic dataset access)
- ComfyUI node package (Python, V1 contract)
- Semantic search surfaced in the web UI

---

## Milestones

---

### M0: Foundation Repair
**Goal**: Eliminate technical debt and ambiguities before building anything new. The dual pipeline confusion, dead dependencies, and missing rate limiting are active blockers to scale.

**Status**: Not started

**Dependencies**: None (must be first)

**Scope**: Medium — cleanup and hardening, no net-new features

**Deliverables**:
- [ ] Remove bullmq and ioredis from package.json (both are declared but have zero implementation)
- [ ] Remove or disable Vercel Blob references in new code paths; S3 is canonical
- [ ] Migrate worker directory from npm to pnpm; verify pnpm-lock.yaml covers all workspaces
- [ ] Audit and resolve AWS SDK version skew between root and worker
- [ ] Evaluate TF.js/COCO-SSD bundle impact; remove if not actively used in any shipped feature
- [ ] Add token-bucket rate limiting to TS worker (130 RPM target, Tier 1; concurrency = min(tier * 0.85, 50))
- [ ] Add asyncio.Semaphore + token-bucket rate limiting to Python pipeline (130 RPM Tier 1)
- [x] AC-23: Legacy detect-shots Next.js route absent; interactive ingest via `ingest-film/stream` + TS worker
- [ ] Move review-splits page into the (site) route group
- [x] Package names: root `metrovision`, worker `metrovision-worker`
- [ ] Verify taxonomy slugs are identical in src/lib/taxonomy.ts and pipeline/taxonomy.py; add assertion in classify.py

**Acceptance Criteria**:
- pnpm install succeeds from root with no npm lockfile conflicts
- No bullmq, ioredis, or Vercel Blob imports remain in active code paths
- TS worker processes 10 rapid-fire single-film classifications without a 429 error
- Python pipeline processes a test batch without rate-limit errors
- taxonomy.py assertion movement_type in MOVEMENT_TYPES passes on all existing shots in DB
- Legacy detect-shots route absent; interactive ingest through TS worker SSE + `ingest-film/stream`

**Risk Areas**:
- pnpm migration may expose latent version conflicts
- TF.js removal could break a UI feature not obviously connected; audit import chain before removing
- Rate limiter in TS worker is non-trivial; use a token-bucket library rather than hand-rolling

**Mitigation**:
- Run full integration smoke test of TS ingest worker before and after cleanup to confirm no regressions
- Keep a git branch snapshot before removing dead dependencies

---

### M1: Two-Lane Pipeline Architecture
**Goal**: Establish the canonical two-lane architecture (TS interactive + Python batch). Build the Python batch worker with Postgres SKIP LOCKED queue. Validate Gemini Batch API video support before committing to it.

**Status**: Not started

**Dependencies**: M0 complete

**Scope**: Large — new Python batch worker, new DB table, Gemini Batch API integration

**Deliverables**:
- [ ] Create batch_jobs table in Neon Postgres (id, status, jsonl_path, submitted_at, completed_at, result_count, error)
- [ ] Run Gemini Batch API prototype: submit 5-10 video clips via File API references in a JSONL batch; confirm video content is supported (AC-24 gate)
- [ ] Build Python batch worker (pipeline/batch_worker.py):
  - Poll batch_jobs table with SELECT ... FOR UPDATE SKIP LOCKED
  - PySceneDetect via Python API (AdaptiveDetector, per-film adaptive threshold)
  - Frame extraction via ffmpeg
  - Assemble JSONL manifest (one request per shot clip)
  - Submit to Gemini Batch API; poll until complete (24h window)
  - Parse JSONL results; write shots to Postgres via asyncpg
  - Multi-process orchestration at film level (one process per film)
- [ ] Implement Postgres-based job submission: POST /api/batch/submit accepts film IDs, inserts batch_jobs rows
- [ ] Admin UI panel for submitting batch jobs and monitoring status (status column + result_count visible)
- [ ] Document two-lane architecture decision in codebase README (AC-20)

**Acceptance Criteria**:
- Gemini Batch API prototype returns structured classification output for at least 5 video clips
- Python batch worker processes a queue of 10 test films end-to-end without crashes
- batch_jobs table reflects accurate status transitions: pending to submitted to complete
- Multi-process worker handles 3 concurrent films without DB lock conflicts
- SKIP LOCKED correctly prevents two worker processes from claiming the same job
- All batch shot writes pass taxonomy slug validation assertion

**Risk Areas**:
- AC-24: Gemini Batch API video support is the highest-risk unknown in the entire project. If batch mode does not support video-via-File-API, the entire bulk classification strategy needs redesign.
- PySceneDetect AdaptiveDetector threshold drift across diverse film styles (PF-009)
- Neon free tier connection limit under multi-process asyncpg load

**Mitigation**:
- Prototype Gemini Batch API video support in the first sprint of M1 before building anything else in this milestone. Gate the milestone on prototype results.
- Fallback plan if batch video fails: synchronous Python pipeline with asyncio concurrency at Tier 2 RPM — slower (approximately 150 films/day at 450 RPM) but functional without architectural redesign
- Expose adaptive_threshold as a per-film CLI argument; log detected shot count so operator can tune per-film
- Use asyncpg connection pool with a ceiling of 5 connections per worker process to avoid Neon exhaustion

---

### M2: Dataset Scale to 500 Films
**Goal**: Classify a minimum of 500 films with structured camera movement metadata and 85% accuracy baseline. This milestone is the hard gate before any product surface launches (AC-19, KD-03).

**Status**: Not started

**Dependencies**: M1 complete (batch worker operational), M0 complete (rate limiting in place)

**Scope**: Large — operational execution milestone, infrastructure tuning, HITL pipeline hardening

**Deliverables**:
- [ ] Source or identify 500+ film video files eligible for processing
- [ ] Run batch worker against 500-film queue; monitor batch_jobs table for completion
- [ ] HITL review pipeline hardened: lower-confidence classifications routed to review queue automatically with needs_review flag
- [ ] Confidence threshold defined and implemented: shots below threshold flagged needs_review = true
- [ ] HITL corrections written back to shots table; corrections feed prompt engineering log
- [ ] Accuracy measurement methodology: sample 100 shots per 100-film tranche, human-grade against taxonomy, calculate agreement rate
- [ ] Reach 85% classification accuracy baseline (measured against HITL-reviewed sample)
- [ ] Monitor Neon storage utilization (AC-11): if approaching 0.5GB, plan Neon tier upgrade before continuing
- [ ] Per-film threshold tuning documented as a runbook for art house / unconventional cinematography

**Acceptance Criteria**:
- 500+ films in the films table with shots, scenes, and camera movement metadata populated
- Shot count per film is plausible (no films with fewer than 5 or more than 2000 shots without operator review)
- 85% classification accuracy confirmed on a human-reviewed sample of 500+ shots
- HITL review queue contains only shots below confidence threshold
- Neon storage below 80% capacity at 500-film milestone
- No batch job fails silently; all failures logged in batch_jobs.error column

**Risk Areas**:
- R-01: Classification accuracy may plateau below 85% for compound movements, long takes, handheld vs. Steadicam disambiguation
- R-02: Dataset sourcing — 500 films at video file level is significant storage and bandwidth
- Neon free tier storage pressure at scale (AC-11)

**Mitigation**:
- If accuracy plateaus below 85%: refine classification prompt with few-shot examples from HITL corrections; increase frame sample rate for ambiguous shots
- Batch process in tranches of 50 films; measure accuracy per tranche; course-correct early
- Plan Neon paid tier upgrade as a concrete budget item before M2 is 60% complete
- Exclude avant-garde/experimental films from the 85% baseline measurement if classification confidence is systematically low

---

### M3: Web Application — Film Browse Hierarchy
**Goal**: Ship the primary academic surface: a performant film to scene to shot browse experience with semantic search, D3 visualizations, and the metadata overlay hero feature.

**Status**: Not started

**Dependencies**: M2 complete (500+ films, 85% accuracy gate cleared)

**Scope**: Large — UI/UX build, metadata overlay, search surface, data export

**Deliverables**:
- [ ] Film browse landing page: grid/list of all classified films with poster, director, year, genre from TMDB
- [ ] Film detail page: scene list with shot counts, D3 coverage overview (shot type frequency, edit rhythm)
- [ ] Scene detail page: shot-level grid with keyframe thumbnails, taxonomy tags, confidence indicators
- [ ] Shot detail page: video playback with metadata overlay (hero feature per AC-22)
- [ ] Metadata overlay implementation: HTML5 Canvas + SVG layered over video element; synchronized to video.currentTime via requestAnimationFrame (with RAF cleanup per AC-16, PF-005); displays movement type, direction arrows, trajectory, shot size, speed
- [ ] Semantic search: text input to OpenAI embedding to pgvector cosine search to shot results with film/scene context (use cosineDistance helper, PF-012)
- [ ] Browse filter state uses URL search params exclusively (useSearchParams + useRouter per AC-10, PF-011); no useState for filters
- [ ] Data export: CSV, Excel (XLSX), JSON download buttons on film and scene detail pages
- [ ] Reference deck creation: user selects shots; export as a structured reference JSON package (PDF in a later iteration)
- [ ] D3 visualizations embedded on film and scene detail pages (RhythmStream, PacingHeatmap, HierarchySunburst)
- [ ] Visual design: technical precision + cinematic elegance; dense information, organized clarity; not a generic SaaS template

**Acceptance Criteria**:
- All 500+ films browsable from the landing page; page load under 2 seconds on desktop
- Metadata overlay renders correctly for a 30-second shot clip; camera motion type visible on screen while video plays; RAF cleanup confirmed (no console errors on navigation)
- Semantic search returns ranked results for queries like "dolly push into face" and "wide establishing shot cityscape"
- Filter state (director, movement type, shot size) is preserved in URL and survives page reload
- CSV export of a film's shots contains all taxonomy fields and is openable in Excel
- Reference deck export contains selected shots with keyframe images and metadata
- No Pages Router patterns anywhere in src/app/ (PF-002)
- Zero useState filter state; all filters in URL params

**Risk Areas**:
- Metadata overlay performance on lower-end hardware; Canvas RAF loop must be lightweight
- Semantic search quality depends on embedding coverage; sparse embeddings produce sparse results
- Reference deck export format may require iteration to be practically useful

**Mitigation**:
- Test metadata overlay on a range of devices early; fall back to SVG-only if Canvas performance is insufficient on target hardware
- Backfill missing embeddings as part of M2 batch processing
- Ship reference deck as JSON first; add formatting polish in a later pass

---

### M4: Intelligence Layer (RAG)
**Goal**: Build the three-layer RAG retrieval architecture and wire it to a foundation model (Claude or Gemini) to power the chat interface and semantic enrichment.

**Status**: Not started

**Dependencies**: M2 complete (dataset scale achieved), M3 complete (product surface live so RAG can be tested against real queries)

**Scope**: Large — new DB tables, corpus ingestion, hybrid retrieval engine, foundation model integration

**Deliverables**:
- [ ] corpus_chunks table: id, source, chunk_index, content, context_statement, embedding vector(1536), tsv tsvector
- [ ] scene_embeddings table: id, scene_id, search_text, embedding vector(768)
- [ ] film_embeddings table: id, film_id, search_text, embedding vector(768)
- [ ] Enable pgvector extension in Neon before migration (CREATE EXTENSION IF NOT EXISTS vector in Neon SQL editor, AC-03, PF-003)
- [ ] Knowledge corpus ingestion pipeline:
  - Sources: cinematography textbooks, research papers, critical analysis articles
  - 512-token recursive character splits with 10-20% overlap
  - Contextual enrichment: LLM generates a context statement per chunk before embedding
  - Embed each chunk with text-embedding-3-large (1536 dims)
  - Write to corpus_chunks with tsvector column for BM25
- [ ] Multi-granularity film embeddings: embed scenes and films (text-embedding-3-small, 768 dims); write to scene_embeddings and film_embeddings
- [ ] Hybrid retrieval engine:
  - Vector search: pgvector cosine similarity (cosineDistance helper from drizzle-orm 0.33+, PF-012)
  - Full-text search: PostgreSQL tsvector/ts_rank (check Neon for ParadeDB pg_bm25; fall back to native tsvector)
  - RRF fusion: score = 1/(60 + rank_vector) + 1/(60 + rank_bm25); fetch 20 candidates from each source
  - Query routing: long NL queries to corpus + scene-level search; short specific queries to shot metadata filter + vector similarity
- [ ] Foundation model integration: RAG-augmented prompts injecting retrieved chunks as context; Claude (Anthropic) as primary reasoning engine
- [ ] Chunk size empirical test: run retrieval quality check at 400, 512, and 600 tokens; pick the winner before full corpus ingestion

**Acceptance Criteria**:
- Query "How does Wes Anderson use pans for pacing?" returns relevant corpus chunks AND matching shot metadata from the dataset
- Query "dolly push close-up face" returns shot-level results ranked by relevance
- RRF fusion retrieves at least 1 relevant result in the top 5 for 90% of a set of 20 test queries
- corpus_chunks populated with at least 3 cinematography sources (one textbook, one research paper, one critical analysis article)
- scene_embeddings and film_embeddings populated for all 500+ classified films
- Foundation model produces a coherent, cinematography-grounded response to a test query
- Neon storage remains within tier limit after adding all embedding tables (AC-11 monitoring)

**Risk Areas**:
- Knowledge corpus quality directly determines intelligence layer quality (R-03)
- ParadeDB pg_bm25 may not be available on Neon; native tsvector/ts_rank is weaker
- Corpus embedding cost at scale (6KB/chunk x thousands of chunks)
- Chunk size choice is empirical; wrong size degrades retrieval significantly

**Mitigation**:
- Curate corpus sources carefully before ingestion; prioritize academic textbooks (Katz "Film Directing Shot by Shot," Mercado "The Filmmaker's Eye") and peer-reviewed cinematography research
- Prototype tsvector BM25 on Neon first; if precision is insufficient investigate ParadeDB or accept vector-only hybrid with RRF across two vector sources
- Run corpus ingestion in batches; monitor OpenAI embedding costs against budget
- Run chunk size empirical test on actual corpus before committing to 512 tokens

---

### M5: Chat Interface — Generative UI
**Goal**: Complete the chat interface with visual output. Wire tool_result payloads to D3 component rendering. Chat must return D3 visualizations, shotlists, and reference decks inline — not text-dominant responses.

**Status**: Not started

**Dependencies**: M4 complete (RAG layer powers chat responses), M3 complete (D3 components exist and are tested in production)

**Scope**: Medium — the approximately 70% infrastructure already exists; the gap is connecting tool results to component rendering

**Deliverables**:
- [ ] Add viz tool definitions to the RAG layer (if a future chat surface returns viz payloads):
  - render_rhythm_stream (film_id, scene_ids) returning typed data payload
  - render_pacing_heatmap (film_id) returning typed data payload
  - render_director_radar (director_name, film_ids) returning typed data payload
  - render_shotlist (scene_id or query result) returning structured shotlist JSON
  - render_reference_deck (shot_ids) returning reference deck JSON
  - render_comparison_table (film_ids or director_ids) returning comparison table JSON
- [ ] ~~Fix chat UI tool_result handler~~ — product chat removed; any future UI should mount pre-registered components only (AC-08: no eval/execute)
- [ ] Implement hybrid streaming: text streams in parallel; D3 components mount only after complete JSON payload received (AC-09: no partial data mounts)
- [ ] Chat route handler: RAG retrieval to foundation model with tool definitions to SSE stream of text + tool_call/tool_result events
- [ ] Chat UI polish: cinematic visual language; tool-result cards feel native to the message thread
- [ ] Query routing in chat: detect query type (long NL vs. short specific) and route to appropriate retrieval path

**Acceptance Criteria**:
- Query "Show me the pacing rhythm for the car chase in Bullitt" returns an inline RhythmStream D3 chart
- Query "Compare Wes Anderson and Stanley Kubrick shot size distribution" returns an inline DirectorRadar or comparison table
- Query "Create a shotlist like the opening of Apocalypse Now" returns a structured shotlist JSON rendered as a list component
- Text response streams in while D3 component data is still loading; D3 component mounts only after payload is complete
- No LLM-generated code is evaluated or executed (AC-08)
- Chat handles a 10-message conversation thread without SSE connection drops

**Risk Areas**:
- Vercel 60s timeout for long RAG retrieval + LLM generation chains (AC-01)
- D3 component data shape may not match LLM tool_result JSON; schema mismatch causes silent render failures
- Chat differentiation risk (R-06): if visual output quality is low it reads as a ChatGPT wrapper

**Mitigation**:
- RAG retrieval must complete within 10s; foundation model generation within 30s; total under 60s for Vercel. Add request timeout monitoring from day one.
- Define strict TypeScript types for each tool result payload; validate LLM output against schema before mounting component
- Test chat UI with real queries against real dataset early; if visual output does not land, increase chart fidelity before shipping

---

### M6: API Portal
**Goal**: Ship a REST API for programmatic dataset access. Enables the ComfyUI integration and any external research tools.

**Status**: Not started

**Dependencies**: M3 complete (dataset browsable, semantic search working), M4 complete (corpus retrieval working)

**Scope**: Small to Medium — REST endpoints over existing data; API key auth; documentation

**Deliverables**:
- [ ] API key generation and validation (keys table in Postgres: id, key_hash, created_at, last_used_at, revoked boolean; no OAuth, no user accounts per AC-21)
- [ ] REST endpoints:
  - GET /api/v1/films — paginated list with filters (director, genre, year)
  - GET /api/v1/films/:id — film detail with scene list
  - GET /api/v1/scenes/:id — scene detail with shot list
  - GET /api/v1/shots/:id — shot detail with full taxonomy metadata
  - GET /api/v1/search?q= — semantic search returning shots with film/scene context
  - GET /api/v1/taxonomy — reference endpoint returning full taxonomy definitions
- [ ] Rate limiting on API routes per API key
- [ ] API documentation page within the web app
- [ ] API key issuance flow: operator-issued keys only (no self-serve at v1)

**Acceptance Criteria**:
- All 6 endpoint groups return correct JSON responses for real dataset queries
- Unauthorized requests (missing or invalid API key) return 401
- /api/v1/search returns semantically relevant results for "handheld dolly push into protagonist face"
- API documentation page lists all endpoints with example requests and responses
- Rate limit correctly rejects requests exceeding the per-key quota

**Risk Areas**:
- API key management without full auth infrastructure is simple but fragile (no scoping, limited revocation)
- Semantic search API depends on RAG layer being stable (M4)

**Mitigation**:
- Keep API key management simple at v1: keys table with revoked boolean; operator manages via admin panel or direct DB access
- Document all known v1 limitations in the API documentation page

---

### M7: ComfyUI Node Package
**Goal**: Ship the MetroVision ComfyUI node package targeting the V1 contract. AI filmmakers can query the MetroVision dataset from within ComfyUI workflows.

**Status**: Not started

**Dependencies**: M6 complete (API portal live with stable endpoints)

**Scope**: Small — Python package, one node type (SceneQuery), V1 contract

**Deliverables**:
- [ ] Create comfyui-metrovision/ Python package directory
- [ ] SceneQuery node: INPUT_TYPES classmethod (film: STRING, shot_type: STRING, movement_filter: STRING, api_key: STRING); RETURN_TYPES: (STRING, INT); FUNCTION: "query"; CATEGORY: "MetroVision"
- [ ] IS_CHANGED returns float("NaN") — not True (AC-12, critical gotcha documented prominently in code comments and README)
- [ ] HTTP GET to MetroVision /api/v1/search with inputs as query params; synchronous requests call
- [ ] NODE_CLASS_MAPPINGS registration in __init__.py
- [ ] pip-installable package structure (pyproject.toml)
- [ ] README with installation instructions; IS_CHANGED gotcha in a prominent warning block
- [ ] Smoke test: install package into a local ComfyUI instance, run SceneQuery node, verify STRING output

**Acceptance Criteria**:
- pip install succeeds for the package
- SceneQuery node appears in ComfyUI node browser under "MetroVision" category
- Running the node with a real API key returns shot metadata as a STRING output
- Node re-executes on each workflow run (IS_CHANGED = float("NaN") confirmed working)
- Stale cache bug does not occur: changing inputs fires a new API call (verify explicitly)

**Risk Areas**:
- ComfyUI V1/V3 API contract may have shifted since research (V3 still stabilizing)
- IS_CHANGED = True silent cache bug is a well-documented gotcha requiring explicit test (AC-12)

**Mitigation**:
- Test against current ComfyUI stable release before packaging
- Add an integration test that explicitly verifies IS_CHANGED behavior by checking that input changes produce new API calls

---

## Cross-Milestone Risk Register

| ID | Risk | Milestones Affected | Likelihood | Impact | Mitigation |
|----|------|-------------------|------------|--------|------------|
| R-AC24 | Gemini Batch API does not support video-via-File-API in batch mode | M1, M2 | Medium | Critical | Prototype first in M1 before building batch worker; fallback = synchronous Python with asyncio at Tier 2 |
| R-ACC | Classification accuracy plateaus below 85% | M2 | Medium | High | Refine prompt with few-shot HITL examples; tune per-film threshold; exclude problematic genres from baseline |
| R-SCALE | Neon free tier storage exhausted before 5,000-film goal | M2, M4 | High | Medium | Monitor actively; plan paid tier upgrade before M2 is 60% complete |
| R-CORPUS | Knowledge corpus quality insufficient for intelligence layer depth | M4 | Medium | High | Curate before ingestion; prioritize academic textbooks and peer-reviewed sources |
| R-TIMEOUT | Vercel 60s timeout exceeded by RAG + LLM generation in chat | M5 | Medium | High | Profile retrieval and generation time early; optimize retrieval to under 10s; use streaming to front-load perceived latency |
| R-TAXONOMY | Taxonomy drift between taxonomy.ts and taxonomy.py causes silent data corruption | All pipeline milestones | Low | High | Assert slug validation in classify.py; consider CI check that diffs slug lists between both files |
| R-OVERLAY | Metadata overlay Canvas RAF loop causes memory leaks or performance issues | M3 | Low | Medium | Always include cancelAnimationFrame cleanup (AC-16); test on target hardware early |
| R-VIBEWALL | AI agent vibe coding hits a wall on complex pipeline or ML infrastructure | M1, M4 | Medium | High | Use managed services; keep implementations simple; prefer library calls over custom algorithms |

---

## Estimated Scope per Milestone

| Milestone | Scope | Calendar Estimate | Blocking Dependency |
|-----------|-------|-------------------|---------------------|
| M0: Foundation Repair | Medium | 3-5 days | None |
| M1: Two-Lane Pipeline | Large | 1-2 weeks | M0 |
| M2: Dataset Scale (500 films) | Large (operational) | 2-4 weeks | M1 |
| M3: Web Application Browse | Large | 1-2 weeks | M2 |
| M4: Intelligence Layer (RAG) | Large | 2-3 weeks | M2, M3 |
| M5: Chat Interface (Generative UI) | Medium | 1 week | M4, M3 |
| M6: API Portal | Small-Medium | 3-5 days | M3, M4 |
| M7: ComfyUI Node Package | Small | 2-3 days | M6 |

Total estimated calendar time: 8-14 weeks. M2 dataset scale is the long pole; all downstream milestones gate on it.

---

## Priority Sequencing Rationale

**P1 (M0 to M1 to M2)**: The dataset is the product. 500 films classified at 85% accuracy is the non-negotiable gate before any product surface launches (AC-19, KD-03). All energy goes here first. Rate limiting (M0) unblocks reliable pipeline runs. Batch worker (M1) unlocks scale. HITL hardening and dataset execution (M2) clear the launch gate.

**P2 (M3)**: Web application browse hierarchy is the primary academic surface. The hero feature (metadata overlay) gets maximum design attention (AC-22). Ships only after the 500-film gate is cleared.

**P3 (M4 to M5 to M6 to M7)**: Intelligence layer, chat, API, and ComfyUI integration. Important but not critical path. If time runs short, M3 (visual-first product surface) is prioritized over M4-M7 per KD-13 (frontend quality over pipeline completeness if time runs short).

---

## Architectural Constraints Quick Reference (for builders)

Builders must respect these across every milestone. Violations cause build failures, data corruption, or architectural regression.

- AC-01: No video processing in Vercel serverless (60s timeout)
- AC-02: Taxonomy slugs must match in taxonomy.ts and taxonomy.py — any change updates both files in the same commit
- AC-03: Enable pgvector extension in Neon BEFORE running drizzle-kit push with vector columns
- AC-04: Import db from src/db/index.ts — never instantiate inside a component or route handler
- AC-05: App Router only — no getServerSideProps, getStaticProps, pages/
- AC-06: No BullMQ / No Redis — Postgres SKIP LOCKED is the job queue
- AC-07: Rate limiting on all Gemini API calls in both TS and Python
- AC-08: No LLM-generated code execution in chat — Generative UI uses pre-registered components only
- AC-09: D3 components receive complete datasets before mount — no partial streaming into components
- AC-10: Filter state in URL search params, not useState
- AC-11: Monitor Neon storage; plan tier upgrade before 5,000-film milestone
- AC-12: ComfyUI IS_CHANGED must return float("NaN") — not True
- AC-13: Never persist Gemini File API IDs to DB — re-upload on each classification run
- AC-14: Pin drizzle-orm to ^0.45.1; use builder API over db.query.*
- AC-15: NEXT_PUBLIC_ prefix for any client-accessible env vars
- AC-16: Every requestAnimationFrame loop must have cancelAnimationFrame cleanup
- AC-17: pnpm across the entire project (after M0 migration)
- AC-18: Zero manual coding — all code generated by AI agents
- AC-19: 500-film gate before any product surface launches
- AC-20: Two-lane pipeline — TS interactive + Python batch — both are canonical
- AC-21: No auth in v1 — API keys only, no user accounts, no OAuth
- AC-22: Metadata overlay is the hero feature — maximum design and engineering attention
- AC-23: detect-shots route retired — interactive ingest through TS worker SSE only
- AC-24: Prototype Gemini Batch API video support before committing to bulk classification architecture
