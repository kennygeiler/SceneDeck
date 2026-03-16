<!-- status: complete -->
# SceneDeck Architecture

## Overview

SceneDeck is a searchable database of iconic cinema shots tagged with structured camera motion metadata. It consists of three subsystems: a data ingestion pipeline (Python), a web application (Next.js), and external AI/GPU services. The system is a portfolio demo serving 50-100 curated shots, not a production-scale product.

## System Boundary Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        VERCEL (Hosting)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Next.js 15 App (App Router)                 │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │   │
│  │  │  Browse UI   │  │  Search UI   │  │  Overlay UI   │   │   │
│  │  │  (filters,   │  │  (semantic    │  │  (video +     │   │   │
│  │  │   directory) │  │   NL query)  │  │   metadata)   │   │   │
│  │  └─────────────┘  └──────────────┘  └───────────────┘   │   │
│  │  ┌─────────────┐  ┌──────────────┐                       │   │
│  │  │  QA/Verify   │  │  Export API  │                       │   │
│  │  │  (0-5 rating)│  │  (JSON/CSV)  │                       │   │
│  │  └─────────────┘  └──────────────┘                       │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐    │   │
│  │  │           API Routes (Route Handlers)            │    │   │
│  │  │  /api/shots, /api/search, /api/verify, /api/export│   │   │
│  │  └──────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────┐   ┌─────────────────┐                     │
│  │  Vercel Blob    │   │  Neon Postgres   │                     │
│  │  (video files)  │   │  (metadata DB)   │                     │
│  └─────────────────┘   └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  DATA PIPELINE (Python, local/CI)               │
│                                                                 │
│  ┌──────────┐   ┌───────────┐   ┌───────────┐   ┌──────────┐  │
│  │  Ingest  │──▶│  Shot     │──▶│  Camera   │──▶│  Upload  │  │
│  │  (FFmpeg)│   │  Detect   │   │  Classify │   │  to DB + │  │
│  │          │   │(PyScene-  │   │(Gemini    │   │  Blob    │  │
│  │          │   │ Detect)   │   │ Flash)    │   │          │  │
│  └──────────┘   └───────────┘   └───────────┘   └──────────┘  │
│                                       │                         │
│                                       ▼ (fallback)             │
│                              ┌───────────────┐                  │
│                              │  RAFT on Modal│                  │
│                              │  (GPU, custom │                  │
│                              │   pipeline)   │                  │
│                              └───────────────┘                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                           │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐    │
│  │ Gemini 2.0    │  │ Modal (GPU)  │  │ Gemini/Claude     │    │
│  │ Flash (camera │  │ RAFT fallback│  │ (scene grouping,  │    │
│  │ classify)     │  │              │  │  semantic metadata)│    │
│  └───────────────┘  └──────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Web Application (Next.js 15)

The monolithic Next.js app handles all frontend and backend concerns for the web experience.

**Pages / Routes:**
- `/` -- Landing page with hero visual, featured shots, search bar
- `/browse` -- Directory view with filters (film, director, movement type, shot size, angle)
- `/shot/[id]` -- Shot detail page with video playback + metadata overlay
- `/verify` -- QA verification interface (0-5 accuracy rating per shot)
- `/api/shots` -- CRUD for shot metadata
- `/api/search` -- Semantic search endpoint
- `/api/verify` -- Submit/update verification ratings
- `/api/export` -- JSON/CSV export of shot metadata

**Key UI Components:**
- `VideoOverlay` -- The hero component. HTML5 `<video>` element with absolutely-positioned canvas/SVG layers rendering camera motion metadata (movement type, direction arrows, trajectory paths, shot size, speed) synchronized to `currentTime` via `requestAnimationFrame`.
- `SearchBar` -- Natural language search input with typeahead
- `FilterSidebar` -- Faceted filters mapped to taxonomy values
- `ShotCard` -- Thumbnail + metadata summary for browse/search results
- `VerificationPanel` -- 0-5 star rating UI with per-field accuracy toggles
- `ExportDialog` -- Format selection and download trigger

**Data Flow (read path):**
1. User visits `/browse` or searches
2. Server component queries Neon via Drizzle ORM
3. Results rendered as shot cards with thumbnails
4. User clicks shot -> `/shot/[id]` loads metadata + video URL
5. `VideoOverlay` renders metadata on top of video playback

**Data Flow (verify path):**
1. User visits `/verify` or clicks "Verify" on a shot
2. Current AI-generated metadata displayed alongside video
3. User rates each metadata field (0-5) and optionally corrects values
4. POST to `/api/verify` updates the shot record in Neon

### 2. Data Pipeline (Python)

A standalone Python pipeline that processes source video files into tagged shots. Runs locally or in CI, not on Vercel. Outputs go to Neon (metadata) and Vercel Blob (video clips).

**Pipeline Stages:**

1. **Ingest**: Accept a source video file (scene from a film). Store source metadata (film title, director, year, source timecodes). Validate format with FFmpeg/ffprobe.

2. **Shot Boundary Detection**: Run PySceneDetect `AdaptiveDetector` on the source video. Output: list of `(start_timecode, end_timecode)` per detected shot. Extract individual shot clips via FFmpeg.

3. **Camera Motion Classification**: For each shot clip:
   - **Primary (Gemini 2.0 Flash)**: Upload clip to Google Files API, call Gemini with structured prompt requesting JSON output conforming to the taxonomy schema (movement type, direction, speed, shot size, angle, compound movements). Cost: under $5 for 100 clips.
   - **Fallback (RAFT on Modal)**: If Gemini accuracy is below threshold on QA review, deploy RAFT optical flow pipeline on Modal. Extract dense optical flow, decompose homography, classify via rule-based system. Output same taxonomy JSON.

4. **Scene Grouping (optional)**: Send keyframes from consecutive shots to Gemini/Claude vision to identify scene boundaries (which shots belong to the same narrative scene). For 50-100 shots this is a single LLM call.

5. **Semantic Metadata (Tier 2)**: For each shot, call Gemini/Claude with the clip + prompt to extract: scene description, subjects/characters, mood/atmosphere, lighting description, notable techniques. This is Tier 2 metadata -- nice-to-have for search enrichment.

6. **Upload**: Write shot metadata to Neon (via Drizzle or direct SQL). Upload shot video clips to Vercel Blob. Store blob URLs in the database.

### 3. Database Schema (Neon PostgreSQL)

Core tables:

```
films
  id            UUID PK
  title         TEXT NOT NULL
  director      TEXT NOT NULL
  year          INT
  tmdb_id       INT (optional, for TMDB enrichment)
  created_at    TIMESTAMPTZ

shots
  id            UUID PK
  film_id       UUID FK -> films.id
  source_file   TEXT (original filename/path reference)
  start_tc      FLOAT (seconds)
  end_tc        FLOAT (seconds)
  duration      FLOAT (seconds)
  video_url     TEXT (Vercel Blob URL)
  thumbnail_url TEXT (Vercel Blob URL)
  created_at    TIMESTAMPTZ

-- Tier 1: Camera Motion Metadata
shot_metadata
  id              UUID PK
  shot_id         UUID FK -> shots.id UNIQUE
  movement_type   TEXT NOT NULL (enum: 21 taxonomy values)
  direction       TEXT (enum: 15 taxonomy values)
  speed           TEXT (enum: 7 taxonomy values)
  shot_size       TEXT (enum: 15 taxonomy values)
  angle_vertical  TEXT (enum: 6 values)
  angle_horizontal TEXT (enum: 5 values)
  angle_special   TEXT (enum: 4 values, nullable)
  duration_cat    TEXT (enum: 6 values)
  is_compound     BOOLEAN DEFAULT FALSE
  compound_parts  JSONB (array of {type, direction} objects)
  classification_source TEXT ('gemini' | 'raft' | 'manual')

-- Tier 2: Semantic Metadata (optional)
shot_semantic
  id              UUID PK
  shot_id         UUID FK -> shots.id UNIQUE
  description     TEXT
  subjects        TEXT[]
  mood            TEXT
  lighting        TEXT
  technique_notes TEXT

-- QA Verification
verifications
  id              UUID PK
  shot_id         UUID FK -> shots.id
  overall_rating  INT CHECK (0-5)
  field_ratings   JSONB ({movement_type: 5, direction: 4, ...})
  corrections     JSONB (optional corrected values)
  verified_at     TIMESTAMPTZ

-- Search support
shot_embeddings
  shot_id         UUID FK -> shots.id UNIQUE
  embedding       VECTOR(768) (pgvector, for semantic search)
  search_text     TEXT (concatenated searchable metadata)
```

**Search Strategy**: Use pgvector extension on Neon for semantic search. Generate embeddings from concatenated metadata text (movement type + direction + speed + description + film + director) using an embedding model (e.g., `text-embedding-3-small`). Also support keyword/filter search via standard SQL WHERE clauses on taxonomy enum fields.

### 4. Video Storage (Vercel Blob)

- Shot clips stored as MP4 files on Vercel Blob (CDN-backed, global distribution)
- Thumbnail images (JPG) extracted at shot midpoint, also on Vercel Blob
- For 50-100 shots at ~10-30 seconds each, total storage is well under 1GB
- Videos served directly from Blob CDN URLs to the HTML5 `<video>` element

### 5. External Service Integration

| Service | Purpose | Interface | Cost Estimate |
|---------|---------|-----------|---------------|
| Gemini 2.0 Flash | Camera motion classification (primary) | Google AI API, video input | < $5 for 100 clips |
| Gemini/Claude | Scene grouping, semantic metadata | Google AI / Anthropic API | < $10 for 100 clips |
| Modal | RAFT optical flow (fallback only) | Python SDK, serverless GPU | < $1 for 100 clips |
| OpenAI | Text embeddings for search | Embeddings API | < $1 for 100 shots |
| TMDB | Film metadata enrichment | REST API (free tier) | Free |

## Deployment Model

- **Web app**: Vercel (connect GitHub repo, auto-deploy on push). Free hobby tier sufficient for demo traffic.
- **Database**: Neon PostgreSQL via Vercel Marketplace. Free tier: 0.5 GB storage, 100 hours compute/month.
- **Video storage**: Vercel Blob. Pay-as-you-go, negligible cost at this scale.
- **Data pipeline**: Runs locally on operator's machine or in a GitHub Action. Not deployed as a service.
- **External APIs**: Gemini, Modal, OpenAI accessed via API keys stored in Vercel environment variables.

## Key Architectural Decisions

1. **Monolithic Next.js app** -- No separate backend service. API routes in Next.js handle all server-side logic. Simplifies deployment and vibe-coding.
2. **Pipeline as offline batch process** -- Not a real-time ingestion service. Run locally, upload results to cloud DB/storage. Appropriate for 50-100 seed shots.
3. **Gemini-first classification** -- Eliminates GPU infrastructure from critical path. Human QA catches errors.
4. **pgvector for search** -- Keeps everything in one database. No separate search service (Elasticsearch, Typesense) needed at this scale.
5. **Taxonomy as code constants** -- The 21 movement types, 15 directions, etc. are hardcoded enums in both TypeScript (web app) and Python (pipeline). Single source of truth in a shared taxonomy file.

## Visual Direction Note

VISION.md Section 12 defines the visual direction: "Technical precision meets cinematic elegance." Visual references include object detection annotation UIs (elevated), ShotDeck, CamCloneMaster, Spotify. The hero moment is the metadata overlay on video playback. Anti-goals: bland dashboards, generic SaaS templates, academic/raw aesthetics. **Planners should generate design artifacts (color palette, typography, component mockups) based on this direction.**
