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
