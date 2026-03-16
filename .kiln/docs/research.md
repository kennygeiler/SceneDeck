# Research Findings
Generated: 2026-03-15T00:00:00Z
Topics: 7 (5 field-researched, 2 assessed by coordinator)

## Executive Summary

There is no off-the-shelf camera motion classifier -- CamCloneMaster is a generation tool, not a classification API. The fastest viable path is using Gemini 2.0 Flash as a vision LLM to classify camera motion directly from video clips, with a custom RAFT optical flow pipeline on Modal as an accuracy fallback. This two-tier strategy eliminates GPU infrastructure from the critical path and lets the team ship a working pipeline in hours, not days. The frontend stack is unambiguous: Next.js 15 + Vercel + shadcn/ui, which has the largest AI training corpus for vibe coding and zero-config deployment. The camera movement taxonomy is comprehensive at 21 movement types with compound notation support, sourced from authoritative cinematography references.

## Cross-Cutting Insights

1. **Gemini-first strategy collapses three open questions.** Using Gemini 2.0 Flash for camera motion classification eliminates the need for cloud GPU infrastructure on day one (resolves OQ-1, OQ-2, and partially OQ-6). Modal becomes a fallback, not a prerequisite.

2. **Human QA is the accuracy safety net.** The vision's design of a 0-5 verification system (KD-05) means the pipeline does not need to be perfect -- it needs to be correctable. This lowers the bar for initial CV accuracy and supports starting with the simpler Gemini approach.

3. **The stack is optimized for a single pattern: Next.js + Vercel + Neon.** Frontend framework, database, hosting, and video storage all converge on the Vercel ecosystem. This minimizes integration complexity and maximizes vibe-code compatibility.

4. **Shot boundary detection is solved.** PySceneDetect is production-ready, CPU-only, and pip-installable. TransNetV2 is more accurate but adds TF2 complexity that is not justified for 50-100 seed shots where human review is already planned.

5. **Taxonomy is well-established.** Cinematography literature provides a stable, authoritative taxonomy. The risk is not "what are the categories" but "mapping CV output to taxonomy labels consistently."

## Findings

### CV Model for Camera Motion (cv-model-camera-motion)
**Question**: What is the best specialized CV model for extracting and classifying camera motion from video into a fixed taxonomy?
**Finding**: No off-the-shelf camera motion classifier exists on Replicate or HuggingFace. CamCloneMaster outputs 6-DoF pose sequences for generation, not taxonomy labels. A custom pipeline would use RAFT optical flow, homography decomposition to separate rotation/scale/translation, residual flow for handheld detection, and a rule-based classifier. However, Gemini 2.0 Flash can classify camera motion directly from video input as a vision LLM -- zero GPU infrastructure, under $5 for 100 clips.
**Recommendation**: Start with Gemini 2.0 Flash for camera motion classification. Validate accuracy with human QA on the first 10-20 clips. If accuracy is below acceptable threshold, build the RAFT pipeline on Modal as a fallback.
**Confidence**: 0.72 (merged sherlock + bourne findings)

### Cloud GPU Service (cloud-gpu-service)
**Question**: Which cloud GPU service is optimal for running video CV models given solo-dev setup speed, cost, and vibe-code compatibility?
**Finding**: Two-tier strategy. Gemini 2.0 Flash eliminates GPU needs for classification (under $5/100 clips, zero infra). If custom CV model is needed, Modal is the best choice -- Python-native DX, ~$0.005/clip on T4 GPU, no Docker required. Banana.dev is defunct. Replicate viable but less flexible for custom models.
**Recommendation**: Defer GPU infrastructure entirely. Use Gemini API first. If fallback needed, deploy RAFT on Modal with their serverless GPU functions.
**Confidence**: 0.72

### Camera Movement Taxonomy (camera-movement-taxonomy)
**Question**: What is the complete fixed taxonomy of camera movements for cinematography classification?
**Finding**: Comprehensive taxonomy: 21 movement types (static, pan, tilt, dolly, truck, crane/boom, zoom, rack focus, roll, steadicam, handheld, whip pan, whip tilt, arc, tracking, push-in, pull-out, reveal, follow, orbiting, reframe), 15 direction values, 7 speed categories, compound movement notation (e.g., "dolly-in + tilt-up"), 15 shot sizes (EWS through insert), 15 camera angles (6 vertical, 5 horizontal, 4 special), 6 duration categories.
**Recommendation**: Adopt the taxonomy as-is for Tier 1 metadata. Implement compound notation for shots with multiple simultaneous movements. Use the shot size and angle categories as part of the fixed schema.
**Confidence**: 0.85

### Frontend Framework (frontend-framework)
**Question**: Which frontend framework best supports a visually striking, metadata-overlay-rich video UI built entirely through AI-assisted coding in 1-2 weeks?
**Finding**: Next.js 15 (App Router) + Vercel is the unambiguous choice. Largest AI training corpus ensures best vibe-coding results. Full stack: shadcn/ui + Tailwind CSS for components, Framer Motion for animations, Vercel Blob for video storage, Neon PostgreSQL + Drizzle ORM for database. Zero-config deployment yields a live URL in under 15 minutes.
**Recommendation**: Adopt Next.js 15 + Vercel + Neon + Drizzle as the full stack. Use shadcn/ui as the component foundation. Use Framer Motion for the metadata overlay animations.
**Confidence**: 0.85

### Shot Boundary Detection (shot-boundary-detection)
**Question**: What are the best tools for shot boundary detection -- accuracy, speed, API ergonomics?
**Finding**: PySceneDetect with AdaptiveDetector is the pragmatic choice: CPU-only, pip-installable, clean Python API, F1 ~0.75-0.80. TransNetV2 is more accurate (F1 ~0.93) but requires TF2 manual setup. For scene-level grouping beyond shot cuts, LLM vision (Gemini/Claude) on keyframes is recommended for small datasets.
**Recommendation**: Use PySceneDetect for shot boundary detection. Accept the lower F1 given human review is already in the pipeline. If accuracy is problematic on specific films, consider TransNetV2 as a targeted upgrade.
**Confidence**: 0.75

### Script Data Sourcing (script-data-sourcing)
**Question**: What APIs and databases exist for sourcing film scripts and metadata for alignment with detected shots?
**Finding**: TMDB API is the primary source for film metadata (free tier, comprehensive). For screenplays: IMSDB (~1,200 scripts, scrapeable), Script Slug, Daily Script. No clean structured API for screenplay text exists -- scraping is standard. For 50-100 seed shots, manual curation is likely faster than automated alignment.
**Recommendation**: Use TMDB API for film metadata (cast, crew, release dates). Defer automated script alignment to post-v1. For seed data, manually associate script excerpts where relevant.
**Confidence**: 0.70

### Metadata Overlay Visualization (metadata-overlay-viz)
**Question**: What are the best approaches for rendering real-time metadata overlays on HTML5 video playback?
**Finding**: HTML5 Canvas overlay synchronized to video currentTime via requestAnimationFrame is the standard approach. Canvas positioned absolutely over the video element in a React component. SVG overlaid for vector graphics (trajectory arrows, motion paths). Framer Motion (already in the recommended stack) handles animated transitions. CSS mix-blend-mode for cinematic overlay aesthetics. Libraries: vidstack or react-player for video control, custom canvas for overlay rendering.
**Recommendation**: Use a layered approach: react-player or vidstack for video control, absolutely-positioned canvas for real-time overlay rendering, SVG for motion path visualizations. Leverage Framer Motion for overlay state transitions.
**Confidence**: 0.75

## Discovered Constraints

1. **No off-the-shelf camera motion classifier exists.** This was assumed possible in the vision (OQ-1). The classification must come from either a vision LLM (Gemini) or a custom-built RAFT pipeline. This is the single biggest architectural implication.
2. **CamCloneMaster is not usable for classification.** It is a camera motion generation/transfer tool, not a classification API. References to it in the vision should be treated as inspiration, not implementation option.
3. **Banana.dev is defunct.** Remove from cloud GPU consideration.
4. **No structured screenplay API exists.** Script alignment for Tier 2 metadata will require scraping or manual curation, not a clean API integration.

## Open Items

1. **Gemini 2.0 Flash accuracy for camera motion classification is untested.** The recommendation to use it is based on capability and cost, not validated accuracy. First 10-20 clips will serve as the accuracy test. If accuracy is poor, the RAFT fallback adds days of engineering.
2. **Maximum shot length for accurate analysis (OQ-6) remains partially unresolved.** Gemini's context window handles long clips easily, but accuracy may degrade on complex compound movements in long takes. Empirical testing needed during pipeline build.
3. **Optimal threshold tuning for PySceneDetect's AdaptiveDetector.** Default thresholds may need per-film adjustment for art house cinema with unconventional editing patterns (e.g., Lynch).
