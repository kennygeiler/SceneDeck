# Architectural Decision Records

## ADR-001: Next.js 15 Monolith on Vercel
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: Need a full-stack framework for a portfolio demo web app with video playback, search, and metadata management. Must be buildable entirely by AI coding agents (zero manual coding constraint).
- **Decision**: Use Next.js 15 (App Router) deployed on Vercel as a monolithic application. API routes handle all backend logic. No separate backend service.
- **Alternatives**: SvelteKit (smaller AI training corpus), Remix (weaker Vercel integration), separate frontend + Express backend (unnecessary complexity for demo scale)
- **Rationale**: Next.js has the largest AI training corpus of any framework, making it the safest choice for vibe-coded development. Vercel provides zero-config deployment with native Next.js support. A monolith eliminates deployment coordination overhead. Research confidence: 0.85.
- **Consequences**: All server logic must fit within Vercel serverless function limits (60s timeout on hobby tier, 4.5 MB function size). Acceptable for 50-100 shot dataset.

## ADR-002: Gemini 2.0 Flash as Primary Camera Motion Classifier
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: No off-the-shelf camera motion classifier exists (research finding). Need to classify video clips into a 21-type taxonomy. Options: (a) vision LLM, (b) custom RAFT optical flow pipeline on GPU.
- **Decision**: Use Gemini 2.0 Flash as the primary classifier. Upload video clips via Google Files API, receive structured JSON taxonomy output. RAFT on Modal is the fallback, built only if Gemini accuracy is below threshold after human QA of first 10-20 clips.
- **Alternatives**: Build RAFT pipeline first (higher accuracy ceiling but days of engineering), fine-tune VideoMAE (requires labeled training data we don't have), CameraCtrl extraction (outputs 6-DoF poses, not taxonomy labels)
- **Rationale**: Eliminates GPU infrastructure from the critical path. Under $5 for 100 clips. Implementable in under 50 lines of Python. Human QA (0-5 rating system) catches classification errors. The vision's design explicitly supports a correctable pipeline (KD-05).
- **Consequences**: Classification accuracy is untested and may vary by movement type. Compound movements and subtle distinctions (dolly vs. zoom) may be harder for an LLM. Mitigation: human QA is already a core feature.

## ADR-003: Neon PostgreSQL with pgvector for All Data + Search
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: Need a database for shot metadata and semantic search capability for natural language queries across 50-100 shots.
- **Decision**: Use a single Neon PostgreSQL instance (via Vercel Marketplace) with pgvector extension for semantic vector search. No separate search service.
- **Alternatives**: Neon + Typesense (adds a separate service to manage), Neon + Elasticsearch (overkill), SQLite (no serverless, no vector search), Supabase (viable but less integrated with Vercel)
- **Rationale**: Keeps everything in one database. pgvector is sufficient for 100 vectors. Neon free tier provides 0.5 GB storage and auto env var injection via Vercel Marketplace. Drizzle ORM supports pgvector. No operational overhead of a second service.
- **Consequences**: Search quality depends on embedding model choice. At 100 shots, even naive keyword search works well. pgvector adds ~10ms per query at this scale.

## ADR-004: PySceneDetect AdaptiveDetector for Shot Boundary Detection
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: Need to detect shot boundaries (cuts) in source video files to decompose scenes into individual shots.
- **Decision**: Use PySceneDetect with AdaptiveDetector. CPU-only, pip-installable, clean Python API.
- **Alternatives**: TransNetV2 (F1 ~0.93 vs ~0.75-0.80 but requires TF2 manual setup), FFmpeg scene filter (no Python API, no dissolve modeling)
- **Rationale**: Lower integration friction matters more than the accuracy delta. Human review is already planned for all seed data. AI coding agents can write PySceneDetect integration reliably. TransNetV2's TF2 dependency adds vibe-coding risk.
- **Consequences**: F1 ~0.75-0.80 means some false positives/negatives in shot boundaries. Acceptable because human QA reviews all shots. Per-film threshold tuning may be needed for art house cinema with unconventional editing.

## ADR-005: Offline Python Pipeline (Not Serverless)
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: The data ingestion pipeline (shot detection, classification, upload) needs to process video files. Where should it run?
- **Decision**: Pipeline runs as a local Python script on the operator's machine (or GitHub Actions). It is not deployed on Vercel. It writes to Neon and Vercel Blob via their APIs.
- **Alternatives**: Vercel serverless functions (60s timeout too short for video processing), Modal end-to-end (adds infrastructure complexity), dedicated server (unnecessary for 50-100 shots)
- **Rationale**: Video processing (FFmpeg, PySceneDetect) requires filesystem access and can take minutes per scene. Local execution is simplest. The pipeline only needs to run a handful of times to process the seed dataset.
- **Consequences**: Pipeline is not auto-triggered. Operator manually runs it. Acceptable for a portfolio demo with a fixed seed dataset.

## ADR-006: Vercel Blob for Video Storage
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: Need CDN-backed storage for 50-100 video clips (10-30 seconds each) and thumbnails.
- **Decision**: Use Vercel Blob for all media storage. Videos served directly from Blob CDN URLs.
- **Alternatives**: AWS S3 + CloudFront (more setup, separate billing), Cloudflare R2 (cheaper but separate platform), Mux (adaptive streaming, overkill for short clips)
- **Rationale**: Vercel Blob integrates natively with the Vercel platform. CDN-backed with global distribution. Total storage under 1 GB. Pay-as-you-go pricing is negligible at this scale. No separate service to configure.
- **Consequences**: Locked into Vercel ecosystem for media. Acceptable for a portfolio demo. Migration to S3/R2 is straightforward if needed later.

## ADR-007: LLM Vision for Scene Grouping
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: After shot boundary detection, shots need to be grouped into narrative scenes (which shots belong together in a sequence).
- **Decision**: Use Gemini/Claude vision API to analyze keyframes from consecutive shots and identify scene boundaries. Send a batch of keyframes with a structured prompt.
- **Alternatives**: CLIP embedding clustering (fails on shot-reverse-shot patterns), audio-based diarization (requires separate audio pipeline), manual grouping (viable at 50-100 shots)
- **Rationale**: For a 50-100 shot seed dataset, LLM vision is the most accurate and cheapest approach. A single API call can analyze an entire film's worth of keyframes. Already using Gemini for classification, so no new service dependency.
- **Consequences**: Cost is negligible. Accuracy for narrative scene grouping is high with modern vision LLMs.

## ADR-008: HTML5 Canvas + SVG Overlay Architecture for Metadata Visualization
- **Date**: 2026-03-15
- **Status**: accepted
- **Context**: The metadata overlay on video playback is the hero feature (C-12). Need to render camera motion type, direction arrows, trajectory paths, shot size, and speed indicators synchronized to video playback.
- **Decision**: Use a layered architecture: vidstack or react-player for video control, absolutely-positioned HTML5 Canvas for real-time frame-by-frame overlay rendering (arrows, trajectories), SVG for vector graphics (motion paths, annotations), Framer Motion for overlay state transitions. Sync via requestAnimationFrame tied to video.currentTime.
- **Alternatives**: WebGL (overkill for 2D overlays), pure CSS animations (insufficient for dynamic data-driven overlays), third-party annotation library (none exist for this specific use case)
- **Rationale**: Canvas + SVG is the standard web approach for video annotation. Canvas handles per-frame rendering; SVG handles crisp vector graphics at any resolution. Framer Motion (already in stack) handles animated transitions between states. This pattern is well-documented and AI agents can generate it reliably.
- **Consequences**: Requires careful synchronization between video playback and overlay rendering. requestAnimationFrame loop must be performant. Testing on mobile may reveal performance issues (acceptable -- portfolio demo is primarily desktop).
