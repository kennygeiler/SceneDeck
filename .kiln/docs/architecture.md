<!-- status: complete -->
# Architecture

## System Overview

MetroVision (SceneDeck) is a three-part platform for structured camera movement analysis at cinematic scale. The architecture separates into: (1) a training infrastructure that ingests films, detects shots, and classifies camera movements; (2) an intelligence layer that augments foundation models with cinematographic knowledge via RAG; and (3) product surfaces that serve academics, AI filmmakers, and integrations.

## Components

### 1. Training Infrastructure (Ingest + Classify)

#### 1a. Interactive Ingest Pipeline (TypeScript Worker)
- **Runtime**: Node.js Express service (`worker/src/ingest.ts`)
- **Purpose**: Single-film ingestion triggered from the web UI with real-time SSE progress streaming
- **Flow**: Upload video -> PySceneDetect (shelled out via CLI) -> frame extraction (ffmpeg) -> Gemini 2.5 Flash classification (inline base64, rate-limited) -> TMDB metadata enrichment -> OpenAI embedding generation -> S3 asset upload -> Postgres write via Drizzle ORM
- **Rate limiting**: Token-bucket at 130 RPM with `concurrency = min(tier_limit * 0.85, 50)` concurrent calls
- **Output**: SSE events per shot (progress, classification result, completion)

#### 1b. Batch Ingest Pipeline (Python Batch Worker) [NEW]
- **Runtime**: Python async worker (`pipeline/batch_worker.py`)
- **Purpose**: Bulk catalogue ingestion for the 5,000-film goal
- **Flow**: Poll Postgres jobs table (`SELECT ... FOR UPDATE SKIP LOCKED`) -> PySceneDetect via Python API (AdaptiveDetector, per-film threshold) -> frame extraction -> Gemini Batch API (JSONL manifest, 200K requests/job, 24h turnaround, 50% cost savings) -> result parsing -> Postgres write via asyncpg
- **Queue**: Postgres SKIP LOCKED (no Redis/BullMQ dependency)
- **Parallelism**: Multi-process orchestration at the film level (one worker process per film; PySceneDetect is single-threaded per video)

#### 1c. HITL Review System
- **Runtime**: Next.js pages + API routes
- **Purpose**: Human-in-the-loop verification of lower-confidence classifications
- **Flow**: Classifications below confidence threshold -> review queue -> operator reviews with 0-5 rating -> corrections written back to shots table
- **Feedback loop**: Corrections feed into prompt engineering improvements for classification prompts

### 2. Intelligence Layer (RAG)

#### 2a. Knowledge Corpus Ingestion [NEW]
- **Sources**: Cinematography textbooks, research papers, critical analysis articles
- **Chunking**: 512-token recursive character splits with 10-20% overlap
- **Enrichment**: Contextual Retrieval -- LLM-generated context statement prepended to each chunk before embedding (reduces failed retrievals by 49%)
- **Storage**: New `corpus_chunks` table in Neon Postgres with `vector(1536)` column
- **Embedding model**: `text-embedding-3-large` (1536 dims) for corpus; `text-embedding-3-small` (768 dims) retained for shot-level volume

#### 2b. Multi-Granularity Film Embeddings [NEW]
- **Levels**: Shot (existing `shot_embeddings`), Scene (new `scene_embeddings`), Film (new `film_embeddings`)
- **Shot-level**: Enriched searchText including scene context
- **Scene-level**: Scene title + description + aggregated shot summary
- **Film-level**: Overview + genre + director + aggregate coverage stats
- **Retrieval**: Parent-child expansion -- search at shot level, expand to scene context for LLM grounding

#### 2c. Hybrid Retrieval Engine [NEW]
- **Vector search**: pgvector cosine similarity on shot/scene/corpus embeddings
- **Full-text search**: PostgreSQL tsvector/ts_rank (BM25-approximate; ParadeDB pg_bm25 if available on Neon)
- **Fusion**: Reciprocal Rank Fusion (RRF) -- `score = 1/(60 + rank_vector) + 1/(60 + rank_bm25)`, fetch 20 candidates from each source
- **Query routing**: Long natural-language queries -> corpus + scene-level search; Short specific queries -> shot-level metadata filtering + vector similarity

#### 2d. Foundation Model Integration
- **Models**: Claude (Anthropic) and/or Gemini as reasoning engine
- **Pattern**: RAG-augmented prompts -- retrieved chunks injected as context alongside the user query
- **Tool calling**: LLM selects visualization tools and returns typed JSON payloads

### 3. Product Surfaces

#### 3a. Web Application (Primary Surface)
- **Framework**: Next.js 15 App Router + React 19
- **UI**: shadcn/ui components
- **Features**: Film -> scene -> shot browsing hierarchy, semantic search, D3 data visualizations, reference deck creation, metadata overlay on video playback (hero visual), data export (CSV, Excel, JSON)
- **Routing**: URL-param-based filter state (not useState) for shareable URLs
- **Visualizations**: 6 D3 chart types (RhythmStream, HierarchySunburst, PacingHeatmap, ChordDiagram, CompositionScatter, DirectorRadar)

#### 3b. Chat Interface
- **Pattern**: Prompt-input, visual-output (Generative UI)
- **Rendering**: Tool-call-to-component pattern -- LLM tool calls return typed JSON payloads, client maps to pre-registered React/D3 components inline in message thread
- **Tools**: `render_rhythm_stream`, `render_pacing_heatmap`, `render_director_radar`, `render_shotlist`, `render_reference_deck`, `render_comparison_table`
- **Streaming**: SSE with hybrid text + structured parts; D3 components mount after complete JSON payload; text streams in parallel
- **Existing infra**: SSE streaming with tool_call/tool_result events already in place; gap is mounting components from tool results instead of discarding them

#### 3c. API Portal [NEW]
- **Purpose**: Programmatic access to the film dataset
- **Protocol**: REST JSON API
- **Endpoints**: Films, scenes, shots, search (semantic + metadata filtering), taxonomy reference
- **Auth**: API key-based (simple, defer OAuth/user accounts)

#### 3d. ComfyUI Node Package [NEW]
- **Target**: V1 contract (widest compatibility), V3 upgrade path later
- **Node**: `SceneQuery` -- string inputs (film, shot type, movement filter), HTTP GET to MetroVision API, STRING + INT outputs
- **Caching**: `IS_CHANGED` returns `float("NaN")` to force re-execution (returning True is silently ignored)
- **Registration**: `NODE_CLASS_MAPPINGS` in `__init__.py`

### 4. Data Layer

#### 4a. Database
- **Engine**: Neon PostgreSQL with pgvector extension
- **ORM**: Drizzle ORM (TypeScript side); asyncpg (Python batch worker)
- **Tables (existing)**: films, scenes, shots, shot_embeddings, verifications
- **Tables (new)**: corpus_chunks, scene_embeddings, film_embeddings, batch_jobs
- **Connection**: `@neondatabase/serverless` HTTP driver (connection-stateless, avoids pool exhaustion)

#### 4b. Object Storage
- **Service**: AWS S3
- **Content**: Video clips, keyframes, thumbnails
- **Access**: Pre-signed URLs for client-side playback

#### 4c. External Services
- **Gemini 2.5 Flash**: Shot classification (interactive + batch)
- **OpenAI**: text-embedding-3-small (shot embeddings), text-embedding-3-large (corpus embeddings)
- **TMDB API**: Film metadata (title, director, cast, year, genre)
- **Claude/Gemini**: Foundation model for RAG reasoning engine + chat

### 5. Taxonomy System
- **Definition**: Fixed hardcoded taxonomy -- 21 movement types, 15 directions, 7 speeds, 15 shot sizes, 15 angles, 6 durations, compound notation
- **Source of truth**: Defined in both `src/lib/taxonomy.ts` (TS) and `pipeline/taxonomy.py` (Python) -- must stay in sync (see PF-001)
- **Principle**: A dolly is always a dolly. Consistency across the entire dataset.

## Data Flow

```
[Video Source]
    |
    v
[Interactive Path]              [Batch Path]
TS Worker (SSE)                 Python Batch Worker
    |                               |
    v                               v
PySceneDetect CLI               PySceneDetect API
    |                               |
    v                               v
Gemini 2.5 Flash (real-time)    Gemini Batch API (JSONL, 24h)
    |                               |
    v                               v
    +-------> Neon Postgres <-------+
              (shots, scenes, films, embeddings)
                    |
                    v
              [Intelligence Layer]
              Hybrid Retrieval (vector + BM25 + RRF)
              + Knowledge Corpus
                    |
                    v
              [Foundation Model] (Claude / Gemini)
              RAG-augmented reasoning
                    |
                    v
              [Product Surfaces]
              Web App | Chat | API | ComfyUI
```

## Deployment Model

| Component | Host | Notes |
|-----------|------|-------|
| Next.js web app | Vercel | App Router, serverless functions (60s timeout) |
| TS ingest worker | Local / Docker | Long-running, not serverless |
| Python batch worker | Local / Docker | Long-running, polls Postgres |
| Neon Postgres | Neon Cloud | Free tier (0.5GB), pgvector enabled |
| S3 media | AWS S3 | Video clips, keyframes |
| ComfyUI nodes | pip package | Installed into user's ComfyUI |

## Module Boundaries (Canonical)

1. **Next.js App** (`src/`) -- Web UI, API routes, server components
2. **TS Ingest Worker** (`worker/`) -- Interactive single-film pipeline with SSE
3. **Python Pipeline Library** (`pipeline/`) -- PySceneDetect, classification, batch worker
4. **D3 Visualizations** (`src/components/visualize/`) -- 6 standalone chart components
5. **RAG API** (`src/app/api/rag/route.ts`, `src/lib/rag-retrieval.ts`) -- Optional retrieval + Gemini Q&A (no dedicated chat UI)
6. **Data Layer** (`src/db/`) -- Drizzle schema, queries, embeddings
7. **Taxonomy** (`src/lib/taxonomy.ts`, `pipeline/taxonomy.py`) -- Shared constants
8. **ComfyUI Package** (`comfyui-metrovision/`) -- Python node package [NEW]

## Key Architectural Decisions

- **Two-lane pipeline**: TS for interactive (SSE streaming), Python for batch (Gemini Batch API + SKIP LOCKED). Both are canonical; neither replaces the other.
- **Postgres as universal backbone**: ORM store + vector index + job queue (SKIP LOCKED). No Redis, no BullMQ.
- **RAG not fine-tuning**: Foundation models augmented with retrieved knowledge, not custom-trained.
- **RAG surface**: Retrieval-backed answers via API; no in-app generative chat shell.
- **Hybrid retrieval**: Vector + BM25 + RRF fusion for highest precision (~84% vs ~62% pure vector).
- **Multi-granularity embeddings**: Shot + scene + film levels for hierarchical retrieval.
