Reading prompt from stdin...
OpenAI Codex v0.114.0 (research preview)
--------
workdir: /Users/kenny.geiler/Documents/Coverage/Claude
model: gpt-5.4
provider: openai
approval: never
sandbox: danger-full-access
reasoning effort: none
reasoning summaries: none
session id: 019cf48b-1f5f-76c3-a660-4fecb859dfb7
--------
user
# SceneDeck Implementation Plan — GPT-5.4

You are creating an implementation plan for SceneDeck, a searchable database of iconic cinema shots tagged with camera motion metadata. This is a portfolio project for a head of product.

## Architecture Summary

3 subsystems:
1. **Next.js 15 App** (Vercel): Browse UI, Search UI, Video Overlay UI, QA/Verify, Export API
2. **Python Data Pipeline** (local): Ingest → Shot Detect (PySceneDetect) → Camera Classify (Gemini 2.0 Flash) → Upload to DB + Blob
3. **External Services**: Gemini 2.0 Flash, Modal (RAFT fallback), OpenAI embeddings, TMDB

## Tech Stack
- Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion
- Neon PostgreSQL + Drizzle ORM + pgvector
- Vercel Blob for video storage
- PySceneDetect for shot detection
- Gemini 2.0 Flash for camera motion classification

## Key Constraints
- C-01: Zero manual coding — all code by AI agents
- C-02: Fixed taxonomy (21 movement types, 15 directions, 7 speeds, 15 shot sizes, 15 angles)
- C-03: Gemini-first classification, RAFT as fallback only
- C-08: Frontend quality over pipeline completeness
- C-11: 1-2 week timeline
- C-12: Metadata overlay is the hero feature (Canvas/SVG over video)

## Database Schema
films (id, title, director, year, tmdb_id)
shots (id, film_id, start_tc, end_tc, duration, video_url, thumbnail_url)
shot_metadata (id, shot_id, movement_type, direction, speed, shot_size, angle_vertical, angle_horizontal, angle_special, duration_cat, is_compound, compound_parts, classification_source)
shot_semantic (id, shot_id, description, subjects, mood, lighting, technique_notes)
verifications (id, shot_id, overall_rating, field_ratings, corrections, verified_at)
shot_embeddings (shot_id, embedding VECTOR(768), search_text)

## Visual Direction
"Technical precision meets cinematic elegance." Object detection annotation UI style but polished. Hero moment: metadata overlay on video. Anti-goals: bland dashboard, generic SaaS, academic/raw.

## Task
Create a milestone-based implementation plan with 5-7 milestones. Each milestone should have:
- Name and description
- Deliverables (specific files/components)
- Acceptance criteria
- Estimated duration (in days)
- Dependencies on previous milestones

The plan should be ordered so that the most impressive demo features ship earliest.

Write the complete plan as markdown. Output ONLY the plan, nothing else.

mcp startup: no servers
codex
# SceneDeck Implementation Plan

## Milestone 1: Hero Overlay Experience
**Description**  
Build the signature SceneDeck experience first: a cinematic shot detail page with playable video, frame scrub, and metadata overlays rendered on top of video. This creates the strongest portfolio demo immediately and validates the product’s visual direction before the full data pipeline exists.

**Deliverables**
- `app/(marketing)/page.tsx`
- `app/shots/[id]/page.tsx`
- `components/video/shot-player.tsx`
- `components/video/metadata-overlay.tsx`
- `components/video/timeline-scrubber.tsx`
- `components/video/overlay-legend.tsx`
- `components/layout/site-header.tsx`
- `components/layout/site-shell.tsx`
- `lib/taxonomy.ts`
- `lib/mock/shot-demo-data.ts`
- `styles/globals.css`

**Acceptance Criteria**
- A visitor can open a shot detail page and play a demo shot with a polished metadata overlay.
- Overlay supports the fixed taxonomy fields: movement type, direction, speed, shot size, and angle.
- UI feels intentional and portfolio-grade on desktop and mobile.
- Overlay can be toggled on/off and individual annotation groups can be shown/hidden.
- At least 3 demo shots exist with believable metadata using mocked data only.
- No generic dashboard styling; visual system reflects “technical precision meets cinematic elegance.”

**Estimated Duration**  
2 days

**Dependencies**  
- None

---

## Milestone 2: Searchable Shot Library
**Description**  
Add the browse and search experience around the hero player so the product already feels like a usable film-shot database. Prioritize discoverability, filtering, and fast navigation into the overlay experience.

**Deliverables**
- `app/shots/page.tsx`
- `components/search/search-bar.tsx`
- `components/search/filter-panel.tsx`
- `components/search/active-filters.tsx`
- `components/shots/shot-card.tsx`
- `components/shots/shot-grid.tsx`
- `components/shots/shot-facets.tsx`
- `lib/search/filter-state.ts`
- `lib/mock/search-demo-data.ts`
- `app/api/shots/route.ts`

**Acceptance Criteria**
- Users can browse a grid of shots and open any shot into the player page.
- Search supports text plus taxonomy filters for movement, direction, speed, shot size, and angle.
- Filters are reflected in the URL for shareable demo states.
- Search results update quickly and feel smooth.
- Empty states and no-match states are designed, not default placeholders.
- Works entirely with seeded/mock data so demo value ships before pipeline completion.

**Estimated Duration**  
2 days

**Dependencies**  
- Milestone 1

---

## Milestone 3: Database, Seed Data, and Real App Data Flow
**Description**  
Replace mock data with a real Neon/Postgres-backed schema and Drizzle integration so the frontend is operating on production-shaped records early. Seed enough curated content to support a strong demo without waiting on full ingestion automation.

**Deliverables**
- `drizzle.config.ts`
- `db/schema/films.ts`
- `db/schema/shots.ts`
- `db/schema/shot-metadata.ts`
- `db/schema/shot-semantic.ts`
- `db/schema/verifications.ts`
- `db/schema/shot-embeddings.ts`
- `db/index.ts`
- `db/queries/shots.ts`
- `db/queries/search.ts`
- `scripts/seed-demo-data.ts`
- `app/api/search/route.ts`
- `app/api/shots/[id]/route.ts`

**Acceptance Criteria**
- All core schema tables exist and match the planned data model.
- The app can render browse, search, and shot detail pages from Neon instead of mock files.
- Seed script inserts a small high-quality dataset of films, shots, metadata, and semantic descriptions.
- Search endpoint supports structured filtering against real DB records.
- Data model enforces the fixed taxonomy and does not allow arbitrary labels.
- Local setup for app + DB is documented enough for AI agents to continue building safely.

**Estimated Duration**  
2 days

**Dependencies**  
- Milestone 2

---

## Milestone 4: QA and Verification Workflow
**Description**  
Build the internal review interface that lets the operator inspect a shot, compare classified metadata, rate confidence, and correct fields. This de-risks Gemini-first classification and produces a concrete workflow for improving dataset quality.

**Deliverables**
- `app/verify/page.tsx`
- `app/verify/[shotId]/page.tsx`
- `components/verify/verification-panel.tsx`
- `components/verify/field-rating-group.tsx`
- `components/verify/correction-form.tsx`
- `components/verify/shot-review-queue.tsx`
- `components/verify/source-badge.tsx`
- `app/api/verifications/route.ts`
- `app/api/verifications/[shotId]/route.ts`
- `lib/validation/verification-schema.ts`

**Acceptance Criteria**
- A reviewer can load a queue of shots needing review.
- A reviewer can rate overall quality and field-level quality.
- A reviewer can submit corrections for taxonomy fields and notes.
- Classification source is visible and distinguishes Gemini vs RAFT fallback.
- Verification records persist to the database and can be read back into the UI.
- Review flow is efficient enough to validate a shot in under 1 minute.

**Estimated Duration**  
1.5 days

**Dependencies**  
- Milestone 3

---

## Milestone 5: Ingest and Classification Pipeline
**Description**  
Implement the local Python pipeline to ingest source clips, detect shots, run Gemini classification, and write results to the database and blob storage. Keep RAFT as a contained fallback path rather than a primary path.

**Deliverables**
- `pipeline/main.py`
- `pipeline/config.py`
- `pipeline/ingest.py`
- `pipeline/shot_detect.py`
- `pipeline/classify_gemini.py`
- `pipeline/classify_raft_fallback.py`
- `pipeline/upload_blob.py`
- `pipeline/write_db.py`
- `pipeline/tmdb_enrich.py`
- `pipeline/models.py`
- `pipeline/prompts/camera_motion_prompt.txt`
- `pipeline/taxonomy.py`
- `pipeline/requirements.txt`

**Acceptance Criteria**
- Local pipeline accepts a film or clip input and produces detected shots.
- PySceneDetect outputs shot boundaries that are persisted as `shots` rows.
- Gemini 2.0 Flash is the default classifier for shot metadata.
- RAFT fallback is only invoked when Gemini output is missing, invalid, or flagged unusable.
- Classified shots upload video assets/thumbnails and persist metadata into DB tables.
- Output records can be opened immediately in the existing Next.js UI without manual fixing.

**Estimated Duration**  
2 days

**Dependencies**  
- Milestone 4

---

## Milestone 6: Semantic Search and Export Readiness
**Description**  
Add embeddings-based semantic retrieval plus a small export surface so the project feels complete as a product system, not just a viewer. This milestone rounds out the portfolio story with discoverability, data richness, and practical output.

**Deliverables**
- `app/search/page.tsx`
- `components/search/semantic-search-input.tsx`
- `components/search/result-reasoning.tsx`
- `app/api/search/semantic/route.ts`
- `app/api/export/shots/route.ts`
- `lib/embeddings/search-text.ts`
- `lib/embeddings/embed-query.ts`
- `db/migrations/*` for `pgvector`
- `scripts/backfill-embeddings.ts`
- `components/export/export-button.tsx`

**Acceptance Criteria**
- A user can search using natural language such as “slow lateral dolly in a tense hallway.”
- Semantic results combine vector relevance with structured metadata filters.
- Search text is built from semantic description plus technical metadata.
- Embeddings are stored in `shot_embeddings` and queried through `pgvector`.
- Export API returns a clean JSON payload for selected shots and metadata.
- End-to-end demo shows: browse -> search -> open shot -> inspect overlay -> verify -> export.

**Estimated Duration**  
1.5 days

**Dependencies**  
- Milestone 5

---

## Milestone 7: Demo Polish, Reliability, and Launch Prep
**Description**  
Use the remaining time to harden the product for presentation quality. Focus on motion polish, performance, edge-case handling, and a single polished Vercel deployment that tells the story clearly.

**Deliverables**
- `app/page.tsx` refinements
- `components/marketing/hero.tsx`
- `components/marketing/demo-strip.tsx`
- `components/system/loading-state.tsx`
- `components/system/error-state.tsx`
- `components/system/empty-state.tsx`
- `middleware.ts` if needed for route shaping
- `README.md`
- `.env.example`
- `vercel.json` if needed
- `docs/demo-script.md`

**Acceptance Criteria**
- The app is deployable on Vercel with stable environment configuration.
- Loading, error, and empty states are intentionally designed across key flows.
- Video pages perform acceptably on common laptop and mobile viewport sizes.
- Demo data and at least a few pipeline-generated real shots coexist cleanly.
- README explains local run flow for app and pipeline clearly enough for another AI agent to continue.
- A concise demo script exists for portfolio presentation.

**Estimated Duration**  
1 day

**Dependencies**  
- Milestone 6
tokens used
11,943
# SceneDeck Implementation Plan

## Milestone 1: Hero Overlay Experience
**Description**  
Build the signature SceneDeck experience first: a cinematic shot detail page with playable video, frame scrub, and metadata overlays rendered on top of video. This creates the strongest portfolio demo immediately and validates the product’s visual direction before the full data pipeline exists.

**Deliverables**
- `app/(marketing)/page.tsx`
- `app/shots/[id]/page.tsx`
- `components/video/shot-player.tsx`
- `components/video/metadata-overlay.tsx`
- `components/video/timeline-scrubber.tsx`
- `components/video/overlay-legend.tsx`
- `components/layout/site-header.tsx`
- `components/layout/site-shell.tsx`
- `lib/taxonomy.ts`
- `lib/mock/shot-demo-data.ts`
- `styles/globals.css`

**Acceptance Criteria**
- A visitor can open a shot detail page and play a demo shot with a polished metadata overlay.
- Overlay supports the fixed taxonomy fields: movement type, direction, speed, shot size, and angle.
- UI feels intentional and portfolio-grade on desktop and mobile.
- Overlay can be toggled on/off and individual annotation groups can be shown/hidden.
- At least 3 demo shots exist with believable metadata using mocked data only.
- No generic dashboard styling; visual system reflects “technical precision meets cinematic elegance.”

**Estimated Duration**  
2 days

**Dependencies**  
- None

---

## Milestone 2: Searchable Shot Library
**Description**  
Add the browse and search experience around the hero player so the product already feels like a usable film-shot database. Prioritize discoverability, filtering, and fast navigation into the overlay experience.

**Deliverables**
- `app/shots/page.tsx`
- `components/search/search-bar.tsx`
- `components/search/filter-panel.tsx`
- `components/search/active-filters.tsx`
- `components/shots/shot-card.tsx`
- `components/shots/shot-grid.tsx`
- `components/shots/shot-facets.tsx`
- `lib/search/filter-state.ts`
- `lib/mock/search-demo-data.ts`
- `app/api/shots/route.ts`

**Acceptance Criteria**
- Users can browse a grid of shots and open any shot into the player page.
- Search supports text plus taxonomy filters for movement, direction, speed, shot size, and angle.
- Filters are reflected in the URL for shareable demo states.
- Search results update quickly and feel smooth.
- Empty states and no-match states are designed, not default placeholders.
- Works entirely with seeded/mock data so demo value ships before pipeline completion.

**Estimated Duration**  
2 days

**Dependencies**  
- Milestone 1

---

## Milestone 3: Database, Seed Data, and Real App Data Flow
**Description**  
Replace mock data with a real Neon/Postgres-backed schema and Drizzle integration so the frontend is operating on production-shaped records early. Seed enough curated content to support a strong demo without waiting on full ingestion automation.

**Deliverables**
- `drizzle.config.ts`
- `db/schema/films.ts`
- `db/schema/shots.ts`
- `db/schema/shot-metadata.ts`
- `db/schema/shot-semantic.ts`
- `db/schema/verifications.ts`
- `db/schema/shot-embeddings.ts`
- `db/index.ts`
- `db/queries/shots.ts`
- `db/queries/search.ts`
- `scripts/seed-demo-data.ts`
- `app/api/search/route.ts`
- `app/api/shots/[id]/route.ts`

**Acceptance Criteria**
- All core schema tables exist and match the planned data model.
- The app can render browse, search, and shot detail pages from Neon instead of mock files.
- Seed script inserts a small high-quality dataset of films, shots, metadata, and semantic descriptions.
- Search endpoint supports structured filtering against real DB records.
- Data model enforces the fixed taxonomy and does not allow arbitrary labels.
- Local setup for app + DB is documented enough for AI agents to continue building safely.

**Estimated Duration**  
2 days

**Dependencies**  
- Milestone 2

---

## Milestone 4: QA and Verification Workflow
**Description**  
Build the internal review interface that lets the operator inspect a shot, compare classified metadata, rate confidence, and correct fields. This de-risks Gemini-first classification and produces a concrete workflow for improving dataset quality.

**Deliverables**
- `app/verify/page.tsx`
- `app/verify/[shotId]/page.tsx`
- `components/verify/verification-panel.tsx`
- `components/verify/field-rating-group.tsx`
- `components/verify/correction-form.tsx`
- `components/verify/shot-review-queue.tsx`
- `components/verify/source-badge.tsx`
- `app/api/verifications/route.ts`
- `app/api/verifications/[shotId]/route.ts`
- `lib/validation/verification-schema.ts`

**Acceptance Criteria**
- A reviewer can load a queue of shots needing review.
- A reviewer can rate overall quality and field-level quality.
- A reviewer can submit corrections for taxonomy fields and notes.
- Classification source is visible and distinguishes Gemini vs RAFT fallback.
- Verification records persist to the database and can be read back into the UI.
- Review flow is efficient enough to validate a shot in under 1 minute.

**Estimated Duration**  
1.5 days

**Dependencies**  
- Milestone 3

---

## Milestone 5: Ingest and Classification Pipeline
**Description**  
Implement the local Python pipeline to ingest source clips, detect shots, run Gemini classification, and write results to the database and blob storage. Keep RAFT as a contained fallback path rather than a primary path.

**Deliverables**
- `pipeline/main.py`
- `pipeline/config.py`
- `pipeline/ingest.py`
- `pipeline/shot_detect.py`
- `pipeline/classify_gemini.py`
- `pipeline/classify_raft_fallback.py`
- `pipeline/upload_blob.py`
- `pipeline/write_db.py`
- `pipeline/tmdb_enrich.py`
- `pipeline/models.py`
- `pipeline/prompts/camera_motion_prompt.txt`
- `pipeline/taxonomy.py`
- `pipeline/requirements.txt`

**Acceptance Criteria**
- Local pipeline accepts a film or clip input and produces detected shots.
- PySceneDetect outputs shot boundaries that are persisted as `shots` rows.
- Gemini 2.0 Flash is the default classifier for shot metadata.
- RAFT fallback is only invoked when Gemini output is missing, invalid, or flagged unusable.
- Classified shots upload video assets/thumbnails and persist metadata into DB tables.
- Output records can be opened immediately in the existing Next.js UI without manual fixing.

**Estimated Duration**  
2 days

**Dependencies**  
- Milestone 4

---

## Milestone 6: Semantic Search and Export Readiness
**Description**  
Add embeddings-based semantic retrieval plus a small export surface so the project feels complete as a product system, not just a viewer. This milestone rounds out the portfolio story with discoverability, data richness, and practical output.

**Deliverables**
- `app/search/page.tsx`
- `components/search/semantic-search-input.tsx`
- `components/search/result-reasoning.tsx`
- `app/api/search/semantic/route.ts`
- `app/api/export/shots/route.ts`
- `lib/embeddings/search-text.ts`
- `lib/embeddings/embed-query.ts`
- `db/migrations/*` for `pgvector`
- `scripts/backfill-embeddings.ts`
- `components/export/export-button.tsx`

**Acceptance Criteria**
- A user can search using natural language such as “slow lateral dolly in a tense hallway.”
- Semantic results combine vector relevance with structured metadata filters.
- Search text is built from semantic description plus technical metadata.
- Embeddings are stored in `shot_embeddings` and queried through `pgvector`.
- Export API returns a clean JSON payload for selected shots and metadata.
- End-to-end demo shows: browse -> search -> open shot -> inspect overlay -> verify -> export.

**Estimated Duration**  
1.5 days

**Dependencies**  
- Milestone 5

---

## Milestone 7: Demo Polish, Reliability, and Launch Prep
**Description**  
Use the remaining time to harden the product for presentation quality. Focus on motion polish, performance, edge-case handling, and a single polished Vercel deployment that tells the story clearly.

**Deliverables**
- `app/page.tsx` refinements
- `components/marketing/hero.tsx`
- `components/marketing/demo-strip.tsx`
- `components/system/loading-state.tsx`
- `components/system/error-state.tsx`
- `components/system/empty-state.tsx`
- `middleware.ts` if needed for route shaping
- `README.md`
- `.env.example`
- `vercel.json` if needed
- `docs/demo-script.md`

**Acceptance Criteria**
- The app is deployable on Vercel with stable environment configuration.
- Loading, error, and empty states are intentionally designed across key flows.
- Video pages perform acceptably on common laptop and mobile viewport sizes.
- Demo data and at least a few pipeline-generated real shots coexist cleanly.
- README explains local run flow for app and pipeline clearly enough for another AI agent to continue.
- A concise demo script exists for portfolio presentation.

**Estimated Duration**  
1 day

**Dependencies**  
- Milestone 6
