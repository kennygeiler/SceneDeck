# MetroVision (SceneDeck)

Searchable film-shot intelligence with **composition-centric metadata** (framing, depth, blocking, lighting, shot size, angles), **vector + text search**, and **playback-aware overlays**. **MetroVision** is the product name; **SceneDeck** is a common repo/codename.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![React](https://img.shields.io/badge/React-19-1d9bf0)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-c5f74f)
![Neon](https://img.shields.io/badge/Neon-Postgres-00e699)
![Vercel](https://img.shields.io/badge/Vercel-Deploy-black)

## Screenshot

`[Screenshot placeholder: landing page / browse archive / shot detail overlay]`

## Live Demo

Placeholder: `https://scenedeck-demo.vercel.app`

## What the product does (features)

| Area | What it’s for |
|------|----------------|
| **Browse** | Filter and explore films and shots using taxonomy fields (framing, shot size, semantic text, etc.). |
| **Film detail** | See a film’s scenes and shots in context (posters, metadata from TMDB where configured). |
| **Shot detail** | Play clips with an **SVG metadata overlay** (composition badges, cues aligned to playback). |
| **Visualize** | Six **D3** views (rhythm, sunburst, heatmap, chord, scatter, radar) for patterns across the archive. |
| **Verify** | Human-in-the-loop queue to review shots, rate fields, and submit corrections. |
| **Verify (batch)** | Batch-oriented review workflow for larger queues. |
| **Review splits** | Upload a film file, inspect auto-detected shot boundaries, tweak, then submit for processing (operator / local-friendly). |
| **Ingest** | Start **SSE-backed** film ingest (local Next stream or remote **TypeScript worker** when `NEXT_PUBLIC_WORKER_URL` points at it). |
| **Agent** | Chat UI backed by **Gemini** with tool calls and optional RAG over the corpus + DB (rate-limited). |
| **Export** | Pull structured shot/film data for research or external tools. |
| **Decks** | Curate and manage shot collections. |
| **Admin** | Operator tools (e.g. accuracy summaries, correction patterns). |
| **REST API (v1)** | API-keyed access for films, shots, search, taxonomy (`Authorization: Bearer …`). |

**Search** uses **pgvector** embeddings when `shot_embeddings` is populated; otherwise it falls back to **ILIKE** text search (see server logs for `[searchShots]` messages). Run `pnpm db:embeddings` after ingest to enable semantic similarity.

**Heavy processing** (long ffmpeg/GPU-style jobs) is meant for the **worker** or **Python pipeline**, not for `process-scene` on Vercel (that route is disabled there by design).

---

## Architecture (ASCII flow)

```
                                    ┌─────────────────────────────────────┐
                                    │           Operators / Users           │
                                    └───────────────────┬─────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        │                               │                               │
                        v                               v                               v
              ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
              │  Next.js 15 App │             │  TS Worker      │             │  Python         │
              │  (Vercel / Node)  │             │  (Express SSE)   │             │  pipeline/      │
              │  App Router, UI,  │             │  Ingest film:    │             │  Batch:         │
              │  API routes, RAG, │             │  detect, extract │             │  PySceneDetect, │
              │  agent chat       │             │  Gemini classify │             │  Gemini, S3, DB │
              └────────┬────────┘             │  TMDB, S3, DB    │             └────────┬────────┘
                       │                     └────────┬────────┘                      │
                       │                              │                              │
                       │         presigned URLs        │                              │
                       └──────────────┬───────────────┴──────────────────────────────┘
                                      v
                            ┌──────────────────┐
                            │   AWS S3         │
                            │   clips / thumbs │
                            └────────┬─────────┘
                                      │
                       ┌──────────────┴──────────────┐
                       v                             v
             ┌─────────────────────┐       ┌─────────────────────┐
             │  Neon PostgreSQL     │       │  External APIs      │
             │  Drizzle ORM         │       │  Gemini, OpenAI,    │
             │  pgvector, films,    │       │  TMDB, Replicate    │
             │  shots, embeddings   │       │  (as configured)    │
             └─────────────────────┘       └─────────────────────┘
```

**Two ingest lanes**

- **Interactive:** Browser → Next **or** worker → SSE stream → same DB + S3.  
- **Batch:** `pipeline/` CLI / workers → DB + S3 (good for many titles or repeatability).

---

## User flows (how people move through the product)

### Researcher or curator (read-heavy)

1. Land on the home page → understand what the archive contains.  
2. Open **Browse** → filter by composition / shot size / text.  
3. Open a **shot** → watch the clip with overlays; jump to **Film** for surrounding context.  
4. Use **Visualize** to see rhythm, director/film patterns, or transition matrices.  
5. Optionally **Export** or build **Decks** for a paper, edit, or presentation.

### Operator (ingest + quality)

1. Configure env (Neon, S3, Gemini, OpenAI for embeddings, TMDB).  
2. **Ingest:** run the **worker** (`cd worker && pnpm dev`) for reliable long jobs, or use the **Ingest** page against a configured worker URL.  
3. Backfill vectors: `pnpm db:embeddings` so search uses semantics.  
4. Use **Verify** / **batch verify** to fix bad rows; **Admin** for aggregates and correction patterns.  
5. Re-run checks locally: `pnpm check:schema-drift`, `pnpm check:taxonomy`.

### Integrator (API)

1. Issue or store an API key (hashed in DB).  
2. Call v1 routes with `Authorization: Bearer <key>` (avoid query-string keys in production).  
3. Use taxonomy + search endpoints to drive external tools or labeling UIs.

---

## Quick Start

```bash
git clone <your-repo-url>
cd <repo-root>
pnpm install
cp .env.example .env.local
pnpm db:push    # apply schema to Neon (requires DATABASE_URL)
pnpm db:seed    # optional dev seed row
pnpm dev
```

Open `http://localhost:3000`.

### Environment Variables

Set the following values in `.env.local` for the Next.js app and `.env` for the Python pipeline:

```bash
DATABASE_URL=                # Neon PostgreSQL connection string
GOOGLE_API_KEY=              # Gemini API key for classification
OPENAI_API_KEY=              # OpenAI API key for embeddings / chat
TMDB_API_KEY=                # TMDB API key for film metadata + posters
AWS_ACCESS_KEY_ID=           # AWS credentials for S3 media storage
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=               # S3 bucket name
AWS_REGION=                  # S3 region (e.g. us-east-1)
NEXT_PUBLIC_WORKER_URL=      # optional: browser ingest targets TS worker
SCENEDETECT_PATH=            # Path to scenedetect binary (pipeline)
```

See `AGENTS.md` for optional production gates (`METROVISION_LLM_GATE_SECRET`, etc.).

## Pipeline Usage

```bash
cd pipeline
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

From there, run the ingestion / classification / upload steps against your source footage and database configuration. The pipeline is responsible for:

- Scene / shot detection via PySceneDetect  
- Shot classification via Gemini (taxonomy mirrored in `pipeline/taxonomy.py` and `src/lib/taxonomy.ts`)  
- Database writes to Neon PostgreSQL  
- Clip and thumbnail upload to AWS S3  

## Architecture Overview (short)

MetroVision is a **Next.js 15 App Router** app (UI + API routes) backed by **Neon**, **Drizzle**, and **S3**. A separate **Express worker** can run the same style of ingest with **SSE** for progress. The **Python** tree is ideal for **batch** and automation. Shared **taxonomy** and **schema drift** checks help keep TS, worker, and Python from silently diverging.

## Built With

- Next.js 15 App Router  
- React 19  
- TypeScript  
- Tailwind CSS 4  
- Framer Motion  
- shadcn/ui + Radix primitives  
- Drizzle ORM  
- Neon PostgreSQL + pgvector  
- AWS S3  
- Gemini & OpenAI APIs  
- PySceneDetect  
- D3  

## Notes

- Built entirely through AI-assisted development  
- Designed as a portfolio-ready demo surface, not a generic CRUD app  
