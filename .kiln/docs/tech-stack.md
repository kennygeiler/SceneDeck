# SceneDeck Tech Stack

## Web Application

| Technology | Version | Purpose | Rationale |
|-----------|---------|---------|-----------|
| Next.js | 15.x (App Router) | Full-stack framework | Largest AI training corpus for vibe-coding; zero-config Vercel deploy; React 19 support; Turbopack for fast dev |
| React | 19.x | UI library | Ships with Next.js 15; Server Components for data fetching |
| TypeScript | 5.x | Language | Default in create-next-app; type safety for taxonomy enums |
| Tailwind CSS | 4.x | Styling | Default in create-next-app; zero config; AI agents generate reliably |
| shadcn/ui | latest | Component library | Editable source files (not node_modules); AI agents can modify directly; built on Radix UI primitives |
| Radix UI | latest | Headless UI primitives | Accessibility built-in; foundation for shadcn/ui |
| Framer Motion | 11.x | Animation | Metadata overlay transitions; page transitions; dominant React animation library |
| Drizzle ORM | 0.38.x+ | Database ORM | Type-safe; minimal boilerplate; AI agents generate reliably; better DX than Prisma for this use case |
| pgvector | 0.8.x (via drizzle) | Vector search | Semantic search via embeddings; runs in Neon PostgreSQL |
| vidstack or react-player | latest | Video playback | HTML5 video control abstraction; event hooks for overlay sync |

## Data Pipeline (Python)

| Technology | Version | Purpose | Rationale |
|-----------|---------|---------|-----------|
| Python | 3.11+ | Pipeline language | Universal for ML/CV tooling; all pipeline deps are Python-native |
| PySceneDetect | 0.6.x | Shot boundary detection | CPU-only; pip-installable; AdaptiveDetector best for high-motion content; clean Python API |
| FFmpeg | 7.x | Video processing | Shot clip extraction; thumbnail generation; format validation |
| google-generativeai | latest | Gemini API client | Camera motion classification; scene grouping; semantic metadata |
| anthropic | latest | Claude API client | Alternative/supplementary LLM for scene grouping and semantic metadata |
| opencv-python | 4.x | Image processing | Frame extraction; used by PySceneDetect internally |
| modal | latest | GPU serverless (fallback) | RAFT optical flow deployment if Gemini accuracy insufficient |
| RAFT | -- | Optical flow (fallback) | State-of-the-art dense optical flow; deployed on Modal if needed |
| httpx or requests | latest | HTTP client | Vercel Blob upload; Neon database writes |
| python-dotenv | latest | Environment config | API key management in local pipeline |

## Infrastructure & Services

| Service | Tier | Purpose | Rationale |
|---------|------|---------|-----------|
| Vercel | Hobby (free) | Web app hosting + CDN | Native Next.js platform; auto-deploy from GitHub; global edge network |
| Neon PostgreSQL | Free tier | Database (0.5GB, 100h compute/mo) | Via Vercel Marketplace; auto env var injection; serverless scale-to-zero |
| Vercel Blob | Pay-as-you-go | Video + thumbnail storage | CDN-backed; integrates with Next.js; sufficient for < 1GB seed data |
| Gemini 2.0 Flash | Pay-per-use | Camera motion classification + semantic analysis | Under $5 for 100 clips; accepts video natively; no GPU infra needed |
| Modal | Pay-per-use | GPU compute (fallback only) | Python-native DX; A10G at $0.000306/sec; cold start 2-8s |
| OpenAI API | Pay-per-use | Text embeddings (text-embedding-3-small) | Semantic search embeddings; < $1 for 100 shots |
| TMDB API | Free tier | Film metadata | Cast, crew, release dates, poster images |
| GitHub | Free | Source control + CI | Vercel auto-deploy trigger |

## Dev Tooling

| Tool | Purpose |
|------|---------|
| Claude Code / Cursor | AI-assisted development (zero manual coding constraint) |
| pnpm | Node.js package manager (faster than npm, default in modern Next.js) |
| uv or pip | Python package manager for pipeline |
| ESLint + Prettier | Code quality (auto-configured by create-next-app) |
| Turbopack | Next.js dev server bundler (ships with Next.js 15) |

## Initialization Commands

```bash
# Web app
npx create-next-app@latest scenedeck --typescript --tailwind --eslint --app --turbopack --use-pnpm
cd scenedeck
npx shadcn@latest init
pnpm add drizzle-orm @neondatabase/serverless framer-motion
pnpm add -D drizzle-kit

# Pipeline
python -m venv .venv
source .venv/bin/activate
pip install scenedetect[opencv] google-generativeai anthropic httpx python-dotenv
```

## Version Pinning Policy

- Pin major versions only (e.g., `next@15`, not `next@15.2.1`). Let minor/patch float for security fixes.
- Exception: Drizzle ORM -- pin minor version due to active API changes.
- Lock files (pnpm-lock.yaml, requirements.txt) committed to source control.
