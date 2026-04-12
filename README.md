# MetroVision

**MetroVision is a shot-level composition archive for cinematography research and tooling**—structured framing/depth/blocking (and related fields), human verification, exports you can cite, and optional vector search. **MetroVision** is the product name; **SceneDeck** is a common repo/codename.

[![CI](https://github.com/kennygeiler/MetroVision/actions/workflows/ci.yml/badge.svg)](https://github.com/kennygeiler/MetroVision/actions/workflows/ci.yml)

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

## What the product does (wedge vs full repo)

| Area | What it’s for |
|------|----------------|
| **Browse** | Filter films and shots by composition taxonomy and text. |
| **Shot detail** | Clip playback, **SVG overlay**, model **confidence**, **review status**, **last human verification**. |
| **Film detail** | Timeline + **share of shots with human verification** + last verification time. |
| **Visualize** | Pattern views across the archive (landing demo deep-links the **composition scatter**). |
| **Export** | JSON/CSV plus an on-page **citation / methodology** blurb (live verification stats). |


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
              │  (Vercel / Node)  │           │  (Express SSE)  │             │  pipeline/      │
              │  App Router, UI,  │           │  Ingest film:   │             │  Batch:         │
              │  API routes, RAG  │           │  detect, extract│             │  PySceneDetect, │
              │                   │           │  Gemini classify│             │  Gemini, S3, DB │
              └────────┬────────┘             │  TMDB, S3, DB   │             └────────┬────────┘
                       │                      └────────┬────────┘                      │
                       │                               │                               │
                       │         presigned URLs        │                               │
                       └──────────────┬─────────────-──┴────────────────────────────-──┘
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

1. **Browse** → filter by composition fields.  
2. **Shot** → overlay + provenance (confidence, label origin, verification).  
3. **Visualize** → e.g. composition scatter (`/visualize#composition-scatter`).  
4. **Export** → download data + copy citation text.

### Operator (ingest + quality)

1. Configure env (Neon, S3, Gemini, OpenAI for embeddings, TMDB).  
2. **Ingest:** run the **worker** (`cd worker && pnpm dev`) for reliable long jobs, or use the **Ingest** page against a configured worker URL.  
3. Backfill vectors: `pnpm db:embeddings` so search uses semantics.  
4. Use **Verify** / **batch verify** to fix bad rows.  
5. Re-run checks locally: `pnpm check:schema-drift`, `pnpm check:taxonomy`, `pnpm test`.

### Boundary evaluation, community presets, and ingest (operator path)

Use this when you care about **shot-boundary** quality before burning a full **Gemini** classification pass. Human verified cuts live in Postgres (`eval_gold_revisions`); boundary presets live in `boundary_cut_presets` (system baselines + **community-shared** contributions).

**ASCII — end-to-end**

```
                         ┌──────────────────────────────────────────┐
                         │  1. Human verified cuts (gold)           │
                         │     /eval/gold-annotate or API           │
                         │     same time window as worker video     │
                         └────────────────────┬─────────────────────┘
                                              │
                         ┌────────────────────▼─────────────────────┐
                         │  2. Boundary Tuning · guided prep         │
                         │     /tuning/prep                          │
                         │     pick film + gold revision + preset    │
                         └────────────────────┬─────────────────────┘
                                              │
              ┌───────────────────────────────▼───────────────────────────────┐
              │  3. TS worker: POST /api/boundary-detect (local videoPath)      │
              │     → predicted interior cutsSec                               │
              └───────────────────────────────┬───────────────────────────────┘
                                              │
              ┌───────────────────────────────▼───────────────────────────────┐
              │  4. Next: POST /api/boundary-eval-runs                         │
              │     → F1 / unmatched FN·FP saved on boundary_eval_runs         │
              └───────────────────────────────┬───────────────────────────────┘
                                              │
              ┌───────────────────────────────▼───────────────────────────────┐
         │  5. Optional: POST /api/boundary-eval-insights (Gemini)        │
         │     plain-language summary + suggested knob automations          │
         │     (gated with METROVISION_LLM_GATE_SECRET when set — AGENTS.md) │
              └───────────────────────────────┬───────────────────────────────┘
                                              │
         ┌────────────────────────────────────▼────────────────────────────────┐
         │  6. Publish duplicate preset (default: share_with_community=true)    │
         │     POST /api/boundary-presets { duplicateFromId, sourceEvalRunId } │
         │     Everyone sees it in GET …?forIngest=1                          │
         └────────────────────────────────────┬────────────────────────────────┘
                                              │
         ┌────────────────────────────────────▼────────────────────────────────┐
         │  7. Ingest                                                         │
         │     /ingest → Boundary model dropdown OR ?boundaryPreset=<uuid>     │
         │     Body includes boundaryCutPresetId → worker OR inline Next path  │
         └────────────────────────────────────┬────────────────────────────────┘
                                              │
                                              ▼
                                    Shots + S3 + classify…
```

**After publish,** operators can flip **community visibility** without re-duplicating: `PATCH /api/boundary-presets/<id>` with `{ "shareWithCommunity": false }` (also in **tuning workspace** when you expand a non-system preset). **System** presets cannot be PATCHed.

**CLI parity (no UI):** `pnpm eval:pipeline`, `pnpm detect:export-cuts`, `pnpm eval:export-film` — see `AGENTS.md` and `eval/gold/README.md`.

**Schema:** apply community columns with `pnpm db:push` (migration `drizzle/0010_boundary_presets_community.sql`).

## Quality gates (CI & tests)

For **labs and toolmakers evaluating the stack**, automated checks are part of the product story—not “cleanup only.”

- **GitHub Actions** (`.github/workflows/ci.yml`): `pnpm lint`, `pnpm check:taxonomy`, `pnpm check:schema-drift`, `pnpm test`.  
- **`pnpm build`** is intentionally **not** required in CI without a real `DATABASE_URL` (Next pages hit the DB at build time); run it locally or in deploy previews with secrets configured.

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
pnpm db:push    # apply schema to Neon (requires DATABASE_URL; includes community preset columns from 0010)
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

**Production ingest (Vercel + worker URL, health checks):** [docs/production-ingest.md](docs/production-ingest.md).

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
