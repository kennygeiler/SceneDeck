# SceneDeck

Searchable film-scene intelligence with structured camera motion metadata and playback-aware overlays.

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

## Quick Start

```bash
git clone <your-repo-url>
cd Claude
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

### Environment Variables

Set the following values in `.env.local` for the Next.js app and `.env` for the Python pipeline:

```bash
DATABASE_URL=
GOOGLE_API_KEY=
VERCEL_BLOB_READ_WRITE_TOKEN=
OPENAI_API_KEY=
```

## Pipeline Usage

```bash
cd pipeline
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

From there, run the ingestion / classification / upload steps against your source footage and database configuration. The pipeline is responsible for:

- Scene detection via PySceneDetect
- Camera-motion classification via Gemini
- Database writes to Neon PostgreSQL
- Clip and thumbnail upload to Vercel Blob

## Architecture Overview

SceneDeck is a Next.js 15 App Router monolith deployed to Vercel. The web app renders a searchable archive of film shots backed by Neon PostgreSQL and Drizzle ORM, with a hero SVG metadata overlay layered over shot playback. Offline analysis lives in `/pipeline`, where source footage is segmented into shots, classified against a shared camera-motion taxonomy, and written back into the application database.

Core product surfaces:

- Landing page with product framing and featured live records
- Browse archive with filterable motion taxonomy controls
- Shot detail page with playback-aware overlay telemetry
- Verification queue for QA review and metadata correction
- Export surface for dataset extraction workflows

## Built With

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- shadcn/ui + Radix primitives
- Drizzle ORM
- Neon PostgreSQL + pgvector
- Vercel Blob
- Gemini 2.0 Flash
- OpenAI API
- PySceneDetect

## Notes

- Built entirely through AI-assisted development
- Designed as a portfolio-ready demo surface, not a generic CRUD app
