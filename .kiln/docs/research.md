# Research Findings
Generated: 2026-03-24T00:00:00Z
Topics: 5 (across 4 agents; sherlock covered 2 merged topics)
Previous round: 2026-03-15 (7 topics covering foundational stack decisions -- retained below as historical context)

## Executive Summary

The 5,000-film classification goal is feasible but requires a two-lane pipeline architecture: the Gemini Batch API (50% cost savings, 200K requests/job, 24-hour turnaround) for bulk catalogue ingestion, and the existing TS worker with proper rate limiting for interactive single-film processing. The current codebase has three overlapping pipeline implementations and dead dependencies (bullmq/ioredis) that must be consolidated before scaling. The RAG intelligence layer should use 512-token recursive chunking with contextual enrichment and hybrid BM25+pgvector search (precision jumps from ~62% to ~84%). The chat interface already has ~70% of the infrastructure needed for visual output -- the missing piece is mounting D3 components from tool-call results instead of discarding them. ComfyUI integration is straightforward via a small Python node package targeting the V1 contract.

## Cross-Cutting Insights

1. **Python stays.** PySceneDetect, Gemini Batch API JSONL workflows, and ComfyUI nodes are all Python-native. The two-language architecture (TS for interactive web, Python for ML/batch/integrations) is the correct long-term split, not a liability to resolve.

2. **Postgres as universal backbone.** The database already serves as ORM store, vector index, and (with SKIP LOCKED) can replace Redis/BullMQ as the job queue. No new infrastructure dependencies are needed for the batch pipeline.

3. **Existing D3 components are reusable across surfaces.** The six standalone D3 visualization components (RhythmStream, HierarchySunburst, PacingHeatmap, ChordDiagram, CompositionScatter, DirectorRadar) can be embedded in chat messages, the web browse UI, and exported as reference decks without modification.

4. **Two distinct query audiences need different retrieval paths.** Academic researchers issue long natural-language technique queries (best served by corpus hybrid search + scene-level embeddings). AI filmmakers issue short specific queries (best served by shot-level metadata filtering + vector similarity). The RAG architecture must support both.

5. **Rate limiting is the single most urgent technical gap.** Neither the TS worker nor the Python pipeline has rate limiting. At Tier 1 (150-300 RPM, 1,500 RPD), the TS worker's 15 concurrent unthrottled calls will intermittently 429. This blocks reliable scaling before any architectural work begins.

## Findings

### 1. Classification Scaling
**Question**: How do we scale Gemini 2.5 Flash classification from current capacity to 50,000-150,000 shots across 5,000+ films?
**Finding**: Gemini 2.5 Flash Tier 1 limits (150-300 RPM, 1,500 RPD) make serial processing infeasible -- 150,000 shots at the daily cap takes ~100 days. The Gemini Batch API (production-available since July 2025) accepts JSONL files up to 2GB with 200,000 requests per job, processes within 24 hours, and costs 50% less than synchronous calls. For interactive single-film ingestion, Python asyncio with Semaphore(50) and a token-bucket rate limiter at ~130 RPM provides safe throughput at Tier 1.
**Recommendation**: Adopt Gemini Batch API as the primary bulk ingestion path. Add token-bucket rate limiting to both TS worker and Python pipeline for interactive use. Target Tier 2 ($250 cumulative spend) for higher RPM/RPD headroom.
**Confidence**: 0.85

### 2. Pipeline Canonicalization
**Question**: How should the three overlapping pipeline implementations (Python CLI, TS worker, Next.js route) be consolidated?
**Finding**: The TS worker is more capable (SSE streaming, TMDB, embeddings, S3, concurrency) but the Python pipeline has genuine strengths (PySceneDetect API access, Python ML ecosystem). bullmq/ioredis were legacy dead weight (removed from root `package.json` as of 2026-04 inventory). The legacy Next.js `detect-shots` shell-out route is retired — it must not return (AC-23).
**Recommendation**: Two-lane architecture -- TS worker for interactive single-film SSE streaming, new Python batch worker for bulk catalogue using PySceneDetect API + Gemini Batch API + Postgres SKIP LOCKED queue. Retire the Python CLI entrypoint (keep as library). Keep interactive shot detection on `ingest-film/stream` + worker only.
**Confidence**: 0.87

### 3. RAG Chunking Strategy
**Question**: What chunking, embedding, and retrieval strategy works for hierarchical film metadata + long-form cinematography knowledge corpus?
**Finding**: 512-token recursive splits with 10-20% overlap won benchmarks at 69% accuracy vs. semantic chunking at 54%. Contextual enrichment (prepending LLM-generated context per chunk) reduces failed retrievals by 49%. Multi-granularity embeddings (shot + scene + film levels) with parent-child retrieval yield +20-35% relevance on structured data. Hybrid BM25+pgvector with Reciprocal Rank Fusion raises precision from ~62% to ~84%.
**Recommendation**: Three-layer retrieval: (1) enriched shot-level vector search, (2) new corpus_chunks table at 512-token splits with contextual enrichment, (3) hybrid BM25+pgvector with RRF fusion. Upgrade corpus embeddings to voyage-3 or text-embedding-3-large; keep text-embedding-3-small for shot-level volume.
**Confidence**: 0.82

### 4. Chat Visual Rendering
**Question**: How should a chat interface render visual output (D3 charts, shotlists, reference decks) inline from LLM responses?
**Finding**: The tool-call-to-component (Generative UI) pattern is the industry standard: LLM tools return typed JSON, client maps to pre-registered React components. MetroVision **removed** the product chat route/UI; six standalone D3 components with typed props remain under `src/components/visualize/`. LLM-generated D3 code (eval/sandbox) is still unreliable—avoid.
**Recommendation**: If chat returns, add "viz tools" that return typed payloads and mount matching D3/list components only after JSON is complete. **`POST /api/rag`** covers text Q&A without a chat shell today.
**Confidence**: 0.88

### 5. ComfyUI Node Integration
**Question**: What is the API contract for ComfyUI custom nodes, and how should MetroVision integrate with ComfyUI, Krea.ai, and Higgsfield?
**Finding**: ComfyUI V1 nodes require INPUT_TYPES (classmethod), RETURN_TYPES (tuple), FUNCTION (string), CATEGORY (string), registered via NODE_CLASS_MAPPINGS. V3 adds typed io.Schema with pinnable API versions. For external API queries, synchronous HTTP inside FUNCTION is the standard pattern. IS_CHANGED must return float("NaN") to force re-execution (returning True is silently ignored). Krea.ai and Higgsfield expose REST APIs only -- no Python node SDKs exist.
**Recommendation**: Build a small Python node package targeting V1 (widest compatibility) with V3 upgrade path. SceneQuery node: string inputs (film, shot type, movement filter), HTTP GET to MetroVision API, STRING+INT outputs. Use IS_CHANGED returning float("NaN"). For Krea.ai and Higgsfield, target their REST APIs via webhook/HTTP -- no custom integration needed.
**Confidence**: 0.82

## Discovered Constraints

- **Gemini Batch API video support needs prototype validation.** Batch API is documented for text/image payloads; video-via-File-API-reference in batch mode is less explicitly documented. A small prototype test is needed before committing to this as the bulk path.
- **Neon free tier storage limit (0.5GB).** At 768-dim vectors (3KB/shot), ~166K shots fit. Sufficient for the 500-film seed but will need monitoring as the corpus grows toward 5,000 films with multi-granularity embeddings.
- **ComfyUI V3 is still stabilizing.** V1 should be the launch target; V3 migration is a post-launch concern.
- **IS_CHANGED = float("NaN") is a critical gotcha.** Using True (the intuitive choice) silently caches stale results. This must be documented prominently in the node package.

## Open Items

- **Optimal chunk size for cinematography corpus.** Benchmarks point to 512 tokens, but the actual corpus (textbooks, dense technical prose) may perform better at 400 or 600. Empirical A/B testing on the real corpus is needed during build.
- **Voyage-3 vs. text-embedding-3-large cost-benefit.** Voyage-3 outperforms by ~5-10% on benchmarks, but cost and latency tradeoffs for the specific cinematography domain are unknown without testing.
- **Storyboard output format (OQ-8).** Not covered in this research round. Needs investigation during build: what structured format do AI generation tools (Runway, Kling) actually consume?
- **Classification accuracy feedback loops (OQ-6).** HITL review pipeline exists but the feedback loop from corrections back to prompt engineering/few-shot examples is not yet designed.
- **BM25 extension choice for Neon.** ParadeDB's pg_bm25 is the best option but may not be available on Neon. Native tsvector/ts_rank is weaker but zero-dependency. Needs Neon compatibility check.

---

## Historical: Round 1 Findings (2026-03-15)

The following findings from the initial research round are retained for context. They cover foundational stack decisions that are now locked.

### CV Model for Camera Motion
Gemini 2.0 Flash adopted for classification (no off-the-shelf classifier exists). RAFT optical flow pipeline on Modal as accuracy fallback. Confidence: 0.72.

### Cloud GPU Service
Two-tier: Gemini API first (zero GPU), Modal for custom CV if needed. Banana.dev defunct. Confidence: 0.72.

### Camera Movement Taxonomy
21 movement types, 15 directions, 7 speeds, compound notation, 15 shot sizes, 15 angles, 6 durations. Adopted as-is. Confidence: 0.85.

### Frontend Framework
Next.js 15 + Vercel + shadcn/ui + Neon + Drizzle. Locked. Confidence: 0.85.

### Shot Boundary Detection
PySceneDetect with AdaptiveDetector (CPU-only, F1 ~0.75-0.80). TransNetV2 as targeted upgrade if needed. Confidence: 0.75.

### Script Data Sourcing
TMDB API for metadata. Screenplay alignment deferred to post-v1. Confidence: 0.70.

### Metadata Overlay Visualization
HTML5 Canvas + requestAnimationFrame over video element. SVG for motion paths. Framer Motion for transitions. Confidence: 0.75.
