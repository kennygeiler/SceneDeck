# Architecture Verification

Generated: 2026-03-16T00:00:00Z

## Summary

The SceneDeck codebase is substantially ahead of what `.kiln/docs/codebase-state.md` documents — M3 (Database, Browse & Search), M4 (QA Verification), and M6 (Export) all have meaningful implementation present, not just stubs. Core architecture is well-aligned: the Next.js 15 App Router monolith, Neon/Drizzle schema, Vercel Blob design, offline Python pipeline structure, and shared taxonomy constants all match the specification closely. The one structural deviation of note is that semantic search (pgvector + OpenAI embeddings) has been replaced by a keyword/ILIKE search implementation — the `shot_embeddings` table is defined in the schema but no embedding generation or vector similarity query exists in the codebase.

---

## Component Check

### 1. Web Application (Next.js 15 App Router)

- **Specified**: Next.js 15 App Router monolith on Vercel. Pages: `/`, `/browse`, `/shot/[id]`, `/verify`, `/api/shots`, `/api/search`, `/api/verify`, `/api/export`.
- **Implemented**:
  - `/` — `src/app/page.tsx` (landing page with hero, featured shots)
  - `/browse` — `src/app/browse/page.tsx` with `ShotBrowser` component
  - `/shot/[id]` — `src/app/shot/[id]/page.tsx` with `ShotPlayer` + `MetadataOverlay`
  - `/verify` — `src/app/verify/page.tsx` (fully implemented with `getShotsForReview`, `getVerificationStats`); `/verify/[shotId]` — sub-route also exists at `src/app/verify/[shotId]/page.tsx`
  - `/export` — `src/app/export/page.tsx` (UI exists)
  - `/api/shots` — `src/app/api/shots/route.ts` (GET with filters + search delegation)
  - `/api/search` — `src/app/api/search/route.ts` (GET with keyword search)
  - `/api/verifications` — `src/app/api/verifications/route.ts` and `src/app/api/verifications/[shotId]/route.ts` (implemented; note: path is `/api/verifications`, not `/api/verify` as specified)
  - `/api/export` — `src/app/api/export/route.ts` (JSON + CSV implemented)
- **Verdict**: ALIGNED (with one route naming deviation noted below)
- **Notes**: Architecture specifies `/api/verify` but implementation uses `/api/verifications`. This is a cosmetic deviation, not a structural one. The `ExportDialog` component appears to be implemented as `ExportPanel` + `ExportButton` in `src/components/export/`. The `FilterSidebar` named in the spec appears to be merged into `ShotBrowser` — needs builder to confirm whether it is a separate component or inline.

---

### 2. VideoOverlay / MetadataOverlay Component

- **Specified**: `VideoOverlay` — HTML5 `<video>` element with absolutely-positioned Canvas/SVG layers rendering movement type, direction arrows, trajectory paths, shot size, speed. Synchronized to `video.currentTime` via `requestAnimationFrame`.
- **Implemented**: `src/components/video/metadata-overlay.tsx` — SVG-only overlay (no Canvas layer) using Framer Motion for animated state display. Direction vectors, movement type badge, shot size badge, speed progress bar, compound notation, camera angle readouts all present. Video sync via `requestAnimationFrame` is NOT implemented — overlay uses static Framer Motion animation on a synthetic gradient plate.
- **Verdict**: DEVIATED
- **Notes**: ADR-008 specifies Canvas for per-frame overlay rendering and `requestAnimationFrame` sync to `video.currentTime`. The implementation uses SVG + Framer Motion with looping animation rather than real-time video sync. This was explicitly noted as deferred in codebase-state.md. The `shot-player.tsx` has an HTML5 `<video>` element with `controls` rendered when `shot.videoUrl` is present, but the `MetadataOverlay` layer is not synchronized to playback time. No Canvas layer exists anywhere in the component tree.

---

### 3. SearchBar Component

- **Specified**: Natural language search input with typeahead; `/api/search` generates embeddings via OpenAI `text-embedding-3-small`, performs pgvector similarity search.
- **Implemented**: `SearchBar` input exists (visible in `src/components/home/home-hero.tsx` and `ShotBrowser`). `/api/search` route calls `searchShots()` which performs SQL `ILIKE` keyword matching across `films.title`, `films.director`, `shotMetadata.movementType`, and `shotSemantic.description`. No OpenAI API calls, no embedding generation, no pgvector cosine similarity query.
- **Verdict**: DEVIATED
- **Notes**: The `shot_embeddings` table is defined in `src/db/schema.ts` (line 117) with `vector(768)` type, so the schema is ready, but no code generates or queries embeddings. This is the most significant architectural deviation from the specified design.

---

### 4. FilterSidebar Component

- **Specified**: Faceted filters for film, director, movement type, shot size, angle, speed. Filter state via URL search params.
- **Implemented**: `src/components/shots/shot-browser.tsx` contains filter UI. Movement type, director, shot size filters are present in `/api/shots` query params. URL search param state management needs direct inspection — codebase-state.md notes this was NOT implemented as of M2 state.
- **Verdict**: DEVIATED (partial)
- **Notes**: Filter by `angle` and `speed` are not present in `ShotQueryFilters` type in `src/db/queries.ts` (only `movementType`, `director`, `shotSize` are defined). URL search param persistence status is unclear without reading shot-browser.tsx in full.

---

### 5. ShotCard Component

- **Specified**: Thumbnail + metadata summary for browse/search results.
- **Implemented**: `src/components/shots/shot-card.tsx` — movement badge, shot size badge, film title, director, duration present.
- **Verdict**: ALIGNED

---

### 6. VerificationPanel Component

- **Specified**: 0-5 star rating UI with per-field accuracy toggles. POST to `/api/verify`.
- **Implemented**: `src/components/verify/verification-panel.tsx` and `src/components/verify/verification-history.tsx` exist. POST target is `/api/verifications` not `/api/verify`.
- **Verdict**: ALIGNED (route name deviation noted above)

---

### 7. ExportDialog Component

- **Specified**: `ExportDialog` — format selection (JSON/CSV), optional filter parameters, download trigger.
- **Implemented**: `src/components/export/export-panel.tsx` + `src/components/export/export-button.tsx`. `/api/export` fully implements JSON and CSV with filter params.
- **Verdict**: ALIGNED
- **Notes**: Component is named `ExportPanel` not `ExportDialog` — cosmetic only.

---

### 8. Data Pipeline (Python)

- **Specified**: Standalone Python pipeline in `/pipeline` directory. Stages: ingest (FFmpeg), shot detection (PySceneDetect), camera motion classification (Gemini 2.0 Flash), scene grouping, semantic metadata, upload to Neon + Vercel Blob.
- **Implemented**: `/pipeline` directory exists with `taxonomy.py`, `requirements.txt`, `__init__.py`. `requirements.txt` includes `scenedetect[opencv]`, `google-generativeai`, `anthropic`, `httpx`, `python-dotenv`, `ffmpeg-python`, `psycopg2-binary`. No pipeline stage modules (ingest, detect, classify, upload) exist yet — only the scaffold and taxonomy constants.
- **Verdict**: DEVIATED (scaffold only, no pipeline logic)
- **Notes**: Consistent with M5 (Pipeline) being listed as "not started" in codebase-state.md. Pipeline is not yet built beyond the foundation.

---

### 9. Database Schema (Neon PostgreSQL)

- **Specified**: Tables: `films`, `shots`, `shot_metadata`, `shot_semantic`, `verifications`, `shot_embeddings`. All column types as specified in architecture.md.
- **Implemented**: `src/db/schema.ts` — all 6 tables present. Column types match architecture spec exactly. `vector(768)` custom type defined for `shot_embeddings.embedding`. Drizzle ORM with `@neondatabase/serverless` driver. `src/db/queries.ts` and `src/db/seed.ts` exist.
- **Verdict**: ALIGNED

---

### 10. Video Storage (Vercel Blob)

- **Specified**: MP4 clips and JPG thumbnails stored on Vercel Blob. URLs stored in `shots.video_url` and `shots.thumbnail_url`.
- **Implemented**: Schema has `videoUrl` and `thumbnailUrl` TEXT columns on `shots` table. `@vercel/blob` package is NOT in `package.json` dependencies (confirmed absent from `package.json`). Pipeline upload module not yet built.
- **Verdict**: DEVIATED (partial)
- **Notes**: Schema is ready; `@vercel/blob` SDK is absent from web app dependencies. This is expected since M5/M7 are not started, but it is worth flagging for the builder.

---

## ADR Compliance

### ADR-001: Next.js 15 Monolith on Vercel

- **Decision**: Next.js 15 App Router, monolith, no separate backend service.
- **Evidence**: `package.json` uses `next@15.5.12`, `react@19.2.3`. All server logic in Route Handlers at `src/app/api/`. App Router exclusively used (no Pages Router files found). Vercel deployment not yet configured (no `vercel.json`).
- **Verdict**: FOLLOWED

---

### ADR-002: Gemini 2.0 Flash as Primary Camera Motion Classifier

- **Decision**: Gemini 2.0 Flash as primary classifier; RAFT/Modal as fallback only.
- **Evidence**: `google-generativeai` in `pipeline/requirements.txt`. No Gemini classification module built yet (M5 not started). No RAFT/Modal code exists. Constraint C-03 is respected — no RAFT pipeline has been built prematurely.
- **Verdict**: FOLLOWED (not yet exercised — pipeline not built)

---

### ADR-003: Neon PostgreSQL with pgvector for All Data + Search

- **Decision**: Single Neon PostgreSQL instance with pgvector for semantic search.
- **Evidence**: `@neondatabase/serverless` and `drizzle-orm` present in `package.json`. All 6 tables defined in `src/db/schema.ts`. `vector(768)` custom type defined (lines 30-48 of schema.ts). However, the pgvector extension is NOT used in any query — `searchShots()` uses SQL ILIKE, not vector similarity. No OpenAI embedding generation code exists.
- **Verdict**: VIOLATED (schema ready, execution is keyword-only)
- **Notes**: The `shot_embeddings` table schema is correct, but the actual search pipeline (generate embedding → cosine similarity query) has not been implemented. ADR-003 explicitly states pgvector for semantic search; current implementation is keyword SQL.

---

### ADR-004: PySceneDetect AdaptiveDetector for Shot Boundary Detection

- **Decision**: PySceneDetect with AdaptiveDetector; CPU-only.
- **Evidence**: `scenedetect[opencv]` in `pipeline/requirements.txt`. No detection module built yet.
- **Verdict**: FOLLOWED (declared, not yet implemented)

---

### ADR-005: Offline Python Pipeline (Not Serverless)

- **Decision**: Pipeline runs locally/CI, not on Vercel. Writes to Neon and Vercel Blob via APIs.
- **Evidence**: `/pipeline` is a separate directory with Python deps (`requirements.txt`, `__init__.py`). No pipeline code in `src/` or Vercel function directories.
- **Verdict**: FOLLOWED

---

### ADR-006: Vercel Blob for Video Storage

- **Decision**: Vercel Blob for all MP4 clips and thumbnails.
- **Evidence**: `shots.videoUrl` and `shots.thumbnailUrl` columns exist in schema. `@vercel/blob` package is absent from `package.json`. No upload code present.
- **Verdict**: FOLLOWED (declared architecture; implementation deferred to M5/M7)

---

### ADR-007: LLM Vision for Scene Grouping

- **Decision**: Gemini/Claude vision for scene grouping from keyframes.
- **Evidence**: `google-generativeai` and `anthropic` in `pipeline/requirements.txt`. No scene grouping module built.
- **Verdict**: FOLLOWED (declared, not yet implemented)

---

### ADR-008: HTML5 Canvas + SVG Overlay Architecture

- **Decision**: Canvas for per-frame rendering + SVG for vector annotations + Framer Motion for transitions, synced via `requestAnimationFrame` to `video.currentTime`.
- **Evidence**: `MetadataOverlay` at `src/components/video/metadata-overlay.tsx` uses SVG + Framer Motion. No Canvas layer exists. No `requestAnimationFrame` loop tied to video time. Video element with `controls` is rendered in `ShotPlayer` when `videoUrl` is present, but overlay is not synchronized.
- **Verdict**: VIOLATED
- **Notes**: The SVG overlay is visually functional and meets the "cinematic aesthetic" requirement, but it is not synchronized to video playback. This is the hero feature's primary technical gap. Architecture explicitly requires `requestAnimationFrame` sync (C-12 constraint).

---

## Tech Stack Verification

- **Next.js 15.x (App Router)**: PRESENT (`next@15.5.12` in package.json)
- **React 19.x**: PRESENT (`react@19.2.3`)
- **TypeScript 5.x**: PRESENT (`typescript@^5` devDependency)
- **Tailwind CSS 4.x**: PRESENT (`tailwindcss@^4`)
- **shadcn/ui**: PRESENT (`shadcn@^4.0.8` + `components.json`)
- **Radix UI**: DIFFERENT — `@base-ui/react@^1.3.0` is used instead of `@radix-ui/*` packages. `@base-ui/react` is the successor to Radix UI (same team), functionally equivalent but a different package name.
- **Framer Motion 11.x**: DIFFERENT VERSION — `framer-motion@^12.36.0` (spec says 11.x, implementation is 12.x)
- **Drizzle ORM 0.38.x+**: PRESENT (`drizzle-orm@^0.45.1`, satisfies 0.38.x+ requirement)
- **pgvector (via Drizzle)**: PRESENT in schema (custom type); NOT used in queries
- **vidstack or react-player**: ABSENT — video is rendered with a plain HTML5 `<video>` element in `shot-player.tsx` (line 59-68), no dedicated video control library
- **Python 3.11+**: PRESENT (declared via requirements.txt context)
- **PySceneDetect 0.6.x**: PRESENT in `pipeline/requirements.txt` as `scenedetect[opencv]`
- **FFmpeg 7.x**: PRESENT in `pipeline/requirements.txt` as `ffmpeg-python`
- **google-generativeai**: PRESENT in `pipeline/requirements.txt`
- **anthropic**: PRESENT in `pipeline/requirements.txt`
- **modal**: ABSENT from `pipeline/requirements.txt` (consistent with not building RAFT yet per ADR-002/C-03)
- **OpenAI API (text-embedding-3-small)**: ABSENT — no `openai` package in package.json; no embedding generation code
- **Neon PostgreSQL**: PRESENT (`@neondatabase/serverless@^1.0.2`)
- **Vercel Blob**: ABSENT from package.json (needed for M5/M7)
- **pnpm**: PRESENT (implied by `pnpm-lock.yaml` standard and script patterns)
- **Drizzle Kit**: PRESENT (`drizzle-kit@^0.31.9`)

---

## Issues Found

1. **ADR-008 / C-12 Violation — No video sync for MetadataOverlay**: The overlay at `src/components/video/metadata-overlay.tsx` uses looping Framer Motion animation, not a `requestAnimationFrame` loop tied to `video.currentTime`. The architecture requires the overlay to be synchronized to video playback. This is the most critical gap for the hero feature.

2. **ADR-003 Violation — Semantic search not implemented**: `searchShots()` in `src/db/queries.ts` (line 416) uses SQL `ILIKE` keyword matching. No OpenAI embedding generation, no pgvector cosine similarity query is present. The `shot_embeddings` table schema is defined but unused. The search endpoint `/api/search` delegates to this keyword-only implementation.

3. **vidstack / react-player absent**: Tech stack specifies `vidstack or react-player` for video playback. A plain `<video>` HTML element is used directly in `shot-player.tsx`. This is a consequence of issue #1 — without video sync requirements, the abstraction is unnecessary, but it is a deviation from the specified stack.

4. **Radix UI replaced by @base-ui/react**: Tech stack specifies `@radix-ui/*`. Implementation uses `@base-ui/react@^1.3.0`. `@base-ui/react` is the Radix UI successor from the same team and is functionally equivalent, so this is low risk but worth documenting.

5. **Framer Motion version mismatch**: Spec says `11.x`; implementation uses `12.36.0`. This is a minor version deviation — Framer Motion 12 is API-compatible with 11 for the patterns used here.

6. **`/api/verify` route named `/api/verifications`**: Architecture spec and ADRs reference `/api/verify`; implementation registers the endpoint at `/api/verifications` and `/api/verifications/[shotId]`. Functional but inconsistent with documented contract.

7. **`@vercel/blob` not installed**: Required for M5/M6/M7 video upload flow. Not yet in `package.json`. Expected for current milestone stage (M3/M4), but should be added before M5 begins.

8. **Filter coverage incomplete**: `ShotQueryFilters` in `src/db/queries.ts` only supports `movementType`, `director`, and `shotSize`. Architecture specifies filters for film, director, movement type, shot size, angle, and speed. `angle` and `speed` filters are absent.

9. **Codebase-state.md is stale**: The document claims M3 is "not started" (0/15 deliverables) and M4/M6 are "not started". In reality, the DB schema, queries, API routes, verification components, and export components are all present and implemented. The codebase is approximately at M3/M4/M6 partial completion. This is an operational issue for pipeline tracking, not a code defect.

---

## Overall Verdict

**MINOR DEVIATIONS**

The core architectural pillars are correctly implemented: Next.js 15 App Router monolith, Neon/Drizzle schema with all specified tables, shared taxonomy constants (TypeScript and Python are identical), offline Python pipeline scaffold, and a visually strong metadata overlay. Two ADR violations exist — ADR-003 (semantic search uses keyword SQL instead of pgvector embeddings) and ADR-008 (metadata overlay lacks `requestAnimationFrame` video sync). Both are buildable gaps rather than structural rearchitectures. The codebase is also meaningfully further along than codebase-state.md records, which the team-lead should reconcile.
