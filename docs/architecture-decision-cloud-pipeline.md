# How We Moved a 76-Minute Film Analysis Pipeline From a MacBook to the Cloud — and What the AI Agents Taught Us About Architecture

*A technical narrative from the Chief Product Officer of SceneDeck*

---

## The Problem That Revealed Itself

It started with Daisies.

Věra Chytilová's 1966 Czech New Wave masterpiece — 76 minutes of anarchic visual poetry. I dropped the file into SceneDeck's ingestion tool on a Sunday afternoon, expecting to see the pipeline parse it into shots, classify each camera movement with Gemini, and deliver a complete film analysis. What I got instead was a spinning waveform animation and a timer that passed seven minutes without flinching.

The shot detection algorithm (PySceneDetect's adaptive detector) was grinding through 4,580 seconds of footage on a single CPU core. At 2-3x realtime processing speed on my M-series MacBook, the math was brutal: 25 to 40 minutes just to find the cuts. Then another hour to classify 200+ shots through Gemini's vision API. Then uploads to S3. Then database writes.

I wasn't building a demo tool anymore. I was trying to analyze entire films. And the architecture I'd built — a beautiful pipeline running inside a Next.js API route on localhost — simply wasn't designed for that.

This is the story of how that realization reshaped SceneDeck's architecture in a single conversation with an AI coding agent. Not a planned migration. Not a sprint. A real-time architectural pivot, driven by the constraint hitting us in the face.

---

## What We Had: The Monolith

SceneDeck started as a Next.js 15 monolith on Vercel. The entire application — web UI, API routes, database queries, and film ingestion pipeline — lived in one repository, one deployment, one runtime.

The ingestion flow looked like this:

```
Browser → /api/ingest-film (Next.js API route)
  → PySceneDetect (shot detection)
  → FFmpeg (clip extraction, 5 parallel)
  → Gemini 2.5 Flash (classification, 5 parallel)
  → S3 (upload clips + thumbnails)
  → Neon PostgreSQL (write shots + metadata)
  → Return JSON
```

All of this ran synchronously inside a single HTTP request handler. On Vercel, that handler has a 60-second timeout on the Hobby tier. Even on Pro, it maxes at 5 minutes.

For our original use case — processing a 5-10 minute scene with 15-30 shots — this worked beautifully. The pipeline completed in 2-3 minutes. The real-time D3 visualization showed each shot frame "developing" like a Polaroid, with movement-type colors revealing themselves as Gemini classifications came back. It was genuinely delightful to watch.

But films aren't scenes.

---

## The First Pivot: Content Detection

The immediate pain point was detection speed. PySceneDetect's `detect-adaptive` algorithm analyzes every pixel of every frame for gradual transitions — dissolves, fades, exposure changes. It's thorough. It's also glacially slow on a laptop.

The agent's first move was tactical: switch to `detect-content`, which only detects hard cuts by comparing frame histograms. It runs at roughly 10x the speed, especially with a 4x downscale factor. For most films — and certainly for a demo — hard cuts are 90%+ of all transitions.

But this was a band-aid. Content detection finishes faster, but the pipeline still has to extract clips, call Gemini for each shot, upload to S3, and write to the database. For a feature-length film, that's still 30-60 minutes of compute tied to my laptop.

The real question was structural: **should the ingestion pipeline run on the same machine that serves the web UI?**

The answer, obviously, is no.

---

## The Architecture Decision: Separate the Worker

The decision to split the pipeline into a standalone worker service wasn't a theoretical exercise. It came from three concrete constraints:

**1. Vercel can't run long jobs.** The serverless model is designed for request-response cycles under 60 seconds. Film ingestion is a batch process that takes 10-45 minutes. These are fundamentally different execution models.

**2. CPU-bound work on a laptop blocks everything.** While PySceneDetect is crunching frames, my MacBook's fans are screaming, the dev server is sluggish, and I can't do anything else. The pipeline is compute-intensive; the web app is I/O-intensive. They don't share well.

**3. Parallelism is bottlenecked by the client machine.** The extract and classify steps run 5 parallel workers, but they're all competing for the same CPU, memory, and network bandwidth. On a dedicated server with better network to AWS and Google, those parallel workers would fly.

The architecture that emerged:

```
Vercel (web app)                    Railway (worker)
┌─────────────┐                    ┌──────────────────────┐
│ /ingest UI  │ ──POST job──────>  │ Express server       │
│ SSE stream  │ <──progress SSE──  │ PySceneDetect        │
│ /browse     │                    │ FFmpeg               │
│ /film/[id]  │                    │ Gemini API calls     │
│ /shot/[id]  │                    │ S3 uploads           │
└─────────────┘                    │ Neon DB writes       │
      │                            └──────────────────────┘
      │                                      │
      └──── Both read from ──────────────────┘
             Neon PostgreSQL + S3
```

The worker is a standalone Express server with its own Dockerfile. It installs FFmpeg, Python, and PySceneDetect at the container level. It exposes the same SSE streaming endpoint the frontend already speaks. The migration is a one-line environment variable change: `NEXT_PUBLIC_WORKER_URL=https://scenedeck-worker.railway.app`.

The frontend doesn't know or care where the pipeline runs. It sends a POST with the video path (or S3 URL), opens an SSE connection, and renders the D3 visualization from the stream. The worker could be on Railway, Fly.io, a Hetzner VPS, or a VM in my closet. The interface is the same.

---

## What the AI Agent Got Right

I want to be specific about what working with an AI coding agent looked like in this decision process, because the narrative around "AI writes code" misses the more interesting reality: **AI accelerates architectural thinking**.

The agent didn't decide to split the worker from the monolith. I did, after watching Daisies sit at 7 minutes with no progress. But what the agent did was:

1. **Diagnosed the bottleneck immediately.** When I reported the hang, it checked running processes, identified that `detect-adaptive` was the culprit, calculated the expected runtime from the film's duration, and proposed the content detector switch — all in about 30 seconds.

2. **Surfaced the infrastructure options.** When I asked "what if I ran this on a server?", it didn't just say "yes, faster." It produced a specific comparison table: Railway ($5-20/mo, auto-sleep), Fly.io (similar), Hetzner CCX23 ($15/mo, dedicated cores), Modal (pay-per-second serverless). Each with a concrete rationale.

3. **Built the worker service in one pass.** The standalone Express server, Dockerfile with FFmpeg + PySceneDetect baked in, identical SSE protocol, S3/Neon integration — all generated in a single implementation cycle. Not a prototype. A deployable service.

4. **Preserved the visualization contract.** The most important architectural decision was keeping the SSE event format identical between the local pipeline and the remote worker. The D3 visualization — the film strip with developing frames, the worker color coding, the ETA calculations — didn't change at all. Zero frontend modifications beyond the base URL.

This is what "agentic architecture" looks like in practice. The agent doesn't replace the product thinker's judgment about what to build. It compresses the time between "I see the problem" and "here's the running solution" from days to minutes.

---

## The Detection Algorithm Trade-off

One detail worth calling out: the detection algorithm choice became a user-facing product decision, not just a technical default.

We added a toggle to the ingestion UI: **Content Detector** (fast, ~1-3 minutes, hard cuts only) versus **Adaptive Detector** (slow, ~20-40 minutes, dissolves and fades too).

The copy makes the trade-off explicit:
- Content: *"Good for most films. Detects hard cuts reliably."*
- Adaptive: *"Better for dissolves, fades, and complex transitions. Use on a server."*

That last line — "Use on a server" — is the product surface of the architecture decision. We didn't hide the infrastructure constraint. We made it legible to the user. If you're on your laptop analyzing a quick scene, use content. If you've deployed the worker to Railway and you're batch-processing Tarkovsky's filmography, use adaptive. The tool adapts to your context.

---

## What's Next

The worker service opens up capabilities that were impossible in the monolith:

- **Batch ingestion.** Queue up 10 films and walk away. The worker processes them sequentially (or parallel, on a bigger machine).
- **GPU acceleration.** Modal or RunPod integration for real RAFT optical flow analysis when Gemini's classification isn't precise enough.
- **Scheduled analysis.** A cron job that re-analyzes existing shots with updated models as Gemini improves.
- **Community processing.** Users could submit films via S3 URL and the worker ingests them without the user needing to run anything locally.

The architecture went from "everything on my laptop" to "UI on Vercel, pipeline anywhere" in a single session. The total implementation time — from the moment I said "is it smart to run this on a server?" to a deployable Dockerized worker with identical SSE streaming — was under an hour.

That's not a story about AI replacing architects. It's a story about AI making architectural pivots cheap enough to do in real time, when the constraint reveals itself, instead of three sprints later when you've already built around it.

---

*SceneDeck is a searchable database of cinema shots tagged with structured camera motion metadata. Built entirely through AI-assisted development. The full pipeline — from vision document to deployed product — was orchestrated through the Kiln multi-agent framework.*

*If you're interested in the technical details of the film analysis pipeline, the D3 visualization system, or the Gemini classification approach, I'll be writing deeper dives on each in upcoming posts.*

---

**Tags:** #ProductManagement #AI #SoftwareArchitecture #AgenticAI #Filmmaking #MachineLearning #StartupEngineering #ClaudeCode #BuildInPublic
