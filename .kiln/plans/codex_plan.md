# SceneDeck Implementation Plan — GPT-5.4

## Milestone 1: Hero Overlay Experience (2 days)
Build the signature SceneDeck experience first: cinematic shot detail page with playable video, frame scrub, and metadata overlays. Creates strongest portfolio demo immediately.

**Deliverables**: Shot player, metadata overlay (Canvas/SVG), timeline scrubber, overlay legend, taxonomy constants, mock data, global styles, site shell/header.

**Acceptance Criteria**: Visitor can play a demo shot with polished metadata overlay. Supports full taxonomy fields. Portfolio-grade UI. Toggle overlay groups. 3 demo shots with mock data. No generic dashboard styling.

**Dependencies**: None

## Milestone 2: Searchable Shot Library (2 days)
Browse and search experience. Discoverability, filtering, fast navigation into overlay.

**Deliverables**: Browse page, search bar, filter panel, shot cards/grid, facets, filter state, mock search data, shots API route.

**Acceptance Criteria**: Grid browse + open to player. Text + taxonomy filters. URL-reflected filters. Smooth updates. Designed empty/no-match states. Works with seeded/mock data.

**Dependencies**: M1

## Milestone 3: Database, Seed Data, Real Data Flow (2 days)
Replace mock data with Neon/Postgres + Drizzle. Seed curated content.

**Deliverables**: Drizzle config, all schema files (films, shots, metadata, semantic, verifications, embeddings), DB index, queries, seed script, search/shots API routes.

**Acceptance Criteria**: All schema tables match data model. App renders from Neon. Seed script inserts high-quality dataset. Search filters against real DB. Taxonomy enforced. Local setup documented.

**Dependencies**: M2

## Milestone 4: QA and Verification Workflow (1.5 days)
Internal review interface. Inspect, rate, correct classified metadata.

**Deliverables**: Verify pages, verification panel, field rating groups, correction form, review queue, source badge, verification API routes, validation schema.

**Acceptance Criteria**: Review queue loads. Rate overall + field-level quality. Submit corrections. Classification source visible. Persists to DB. Under 1 minute per shot.

**Dependencies**: M3

## Milestone 5: Ingest and Classification Pipeline (2 days)
Local Python pipeline: ingest → shot detect → Gemini classify → upload to DB + Blob.

**Deliverables**: Pipeline modules (main, config, ingest, shot_detect, classify_gemini, classify_raft_fallback, upload_blob, write_db, tmdb_enrich, models, taxonomy), Gemini prompt template, requirements.txt.

**Acceptance Criteria**: Accepts film/clip input, produces detected shots. PySceneDetect boundaries persist. Gemini 2.0 Flash as default classifier. RAFT fallback only when needed. Uploads video + thumbnails. Records work in Next.js UI immediately.

**Dependencies**: M4

## Milestone 6: Semantic Search and Export (1.5 days)
Embeddings-based semantic retrieval + export surface.

**Deliverables**: Search page, semantic search input, result reasoning, semantic search API, export API, embedding utilities, pgvector migrations, backfill script, export button.

**Acceptance Criteria**: Natural language search works ("slow lateral dolly in a tense hallway"). Combines vector + structured filters. Embeddings stored/queried via pgvector. Export returns clean JSON. Full end-to-end demo flow works.

**Dependencies**: M5

## Milestone 7: Demo Polish and Launch (1 day)
Harden for presentation quality. Motion polish, performance, edge cases, deployment.

**Deliverables**: Landing page refinements, hero component, demo strip, loading/error/empty states, README, .env.example, demo script.

**Acceptance Criteria**: Stable Vercel deployment. Designed states across all flows. Performs on laptop/mobile. Demo + pipeline data coexist. README clear. Demo script exists.

**Dependencies**: M6

**Total: ~12 days**
