# VISION

## 1. Problem Statement

Existing film reference tools like ShotDeck analyze cinema through still frames, failing to capture the essence of filmmaking — how the camera moves. There is no centralized, searchable database of film scenes tagged with structured camera motion metadata. AI filmmakers cannot accurately describe camera movements to generation tools (Runway, Kling, Gemini), and film researchers lack quantifiable data to analyze directorial style and coverage patterns.

**Who:** AI filmmakers who need camera motion references for generation tools, and film researchers/students who want to analyze coverage, edit patterns, and directorial style across films and filmographies.

**Why now:** AI video generation tools have matured to the point where camera motion is a controllable parameter, but users have no structured reference library to draw from. Simultaneously, computer vision models capable of extracting camera motion from video now exist (CamCloneMaster and equivalents). The infrastructure to build this didn't exist two years ago.

## 2. Target Users

**Primary User: AI Filmmakers**
- Job-to-be-done: Find a reference camera movement from real cinema and use it to direct AI video generation tools
- They have a vision in their head (often from a film they've seen) but cannot accurately describe camera motion in text prompts to tools like Runway, Kling, or ComfyUI
- SceneDeck bridges the gap: search for the movement, get structured data or a reference clip to feed into generation pipelines
- Workflow integration matters — SceneDeck as a node in ComfyUI or accessible via API/MCP within their existing creative pipeline

**Secondary User: Film Researchers & Students**
- Job-to-be-done: Analyze directorial style, coverage patterns, and edit rhythms using quantifiable camera metadata
- Want to compare directors (Lynch vs. Safdie), deconstruct iconic scenes shot-by-shot over time, and study how coverage builds a sequence
- Need data export (API, CSV, JSON) to take metadata into their own visualization and analysis tools
- Use case example: film school teacher breaking down the Bullitt car chase — showing coverage patterns, shot type frequency, edit rhythm as a time series

**Portfolio Evaluator (implicit user for v1)**
- A hiring manager or VP of Product visiting the live demo
- Should be able to interact with the full experience: search, browse, view metadata overlays, and participate in the verification workflow
- The verification process itself is a demonstrable feature — evaluators can see and use the human QA system

**Contribution model:** Any user can contribute — verifying AI accuracy, submitting scenes for analysis. This is not a separate user type but a natural extension of use, similar to donating to open source. Good stewardship, not a gated role.

## 3. Goals

1. Build a searchable database of 50-100 iconic art house cinema shots tagged with structured camera motion metadata, deployed at a live URL
2. Demonstrate a working data pipeline that decomposes film scenes into shots and extracts camera metadata using specialized computer vision models on cloud GPU infrastructure
3. Implement a fixed, hardcoded camera movement taxonomy that produces consistent classification across all shots — a dolly is always a dolly
4. Create a visually striking metadata overlay UI that renders camera motion data on top of video playback, suitable for screen-recording and social media demonstration
5. Design a human QA verification system (0-5 accuracy rating) that ensures seed data is 100% verified correct
6. Build the entire project exclusively through AI-assisted development — prompting, work relays, and human oversight tasks only, zero manual coding
7. Deliver a tiered metadata schema: Tier 1 (camera motion, shot framing, duration), Tier 2 (content/semantic), Tier 3 (lens/optics, temporal/edit context)
8. Provide data export capabilities (API, CSV, JSON, MCP) so metadata can be consumed by external tools and workflows
9. Document the planning, decision-making, and execution process as an article series demonstrating how a director-level PM uses agentic AI workflows
10. Ship within 1-2 weeks of full-time work

## 4. Constraints

**Technical:**
- Entire project must be buildable through prompting AI coding agents (Claude, Cursor) — zero manual coding by the operator
- Operator can: prompt, add API keys, permission services, do work relays, update variables
- Camera motion analysis requires cloud-hosted GPU service (Replicate, Modal, RunPod, or equivalent) — no local GPU inference
- Exact camera motion extraction tool is TBD — requires research to identify the right specialized CV model
- Shot length should be as long as the analysis engine can handle accurately — accuracy is the constraint, not length or cost

**Time:**
- 1-2 weeks of full-time work, total
- Frontend experience is the priority if time runs short — pipeline can be correctable by humans, UI must be amazing

**Budget:**
- Willing to invest what it takes for quality — few hundred dollars per month as general range, not a hard cap
- Community/local processing model defers compute costs to contributors in future versions

**Team:**
- Solo developer (operator) with AI agent assistance
- No design team — UI must be achievable through AI-generated code with operator direction

**Content:**
- Educational project, not for profit — licensing is not a concern
- Seed shots hosted fully on server for the best possible employer demo experience
- Future community version would shift to user-provided files for playback

## 5. Non-Goals

1. Production-ready scalable product — SceneDeck v1 is a portfolio demo, not a product serving real users at scale
2. User authentication and access controls — No login, no accounts, no private workspaces for v1
3. Curated collections and playlists — post-v1
4. In-platform data visualization — Researchers export data and use their own tools
5. AI video generation — SceneDeck is a reference and metadata library, not a generation tool
6. Manual coding by the operator — If it cannot be built by prompting AI agents, it is out of scope
7. Comprehensive film library — v1 is 50-100 curated iconic shots
8. Storyboard generation — future vision, not in v1 scope

## 6. Tech Stack

**Decided:**
- AI Development Workflow: Claude Code, Cursor, or equivalent AI coding agents
- Camera Motion Analysis: Specialized computer vision model on cloud-hosted GPU service — exact model TBD pending research
- Shot Boundary Detection: Likely PySceneDetect or equivalent — exact choice TBD
- Semantic/Contextual Metadata: LLM API (Claude, Gemini) for script alignment, character identification, scene description
- Data Export: API, CSV, JSON, MCP plugin

**To be decided (by AI agents, with operator approval of tradeoffs):**
- Frontend framework
- Backend/API
- Database
- Hosting/Deployment
- Video storage for seed data
- Search implementation

**Philosophy:** Stack decisions should optimize for speed of setup, vibe-code compatibility, and demo quality — not scalability.

## 7. Success Criteria

- SC-01: Live, deployed URL that functions without errors
- SC-02: 50-100 iconic shots with Tier 1 metadata, 100% human-verified correct
- SC-03: AI-powered semantic search returns relevant results for natural language queries
- SC-04: Directory browsing works — filterable by film, director, camera motion type, tags
- SC-05: Metadata overlay renders on video playback — visually striking and screen-recordable
- SC-06: Human QA verification system functional — 0-5 accuracy rating per shot
- SC-07: Data export works in at least one format
- SC-08: Data pipeline demonstrably works — at least one scene ingested and decomposed
- SC-09: Zero lines of code written manually by the operator
- SC-10: Documentation artifact captures planning, decisions, and execution

## 8. Risks & Unknowns

- R-01: Camera motion analysis accuracy (HIGH/HIGH) — core technical risk, mitigated by research + human QA
- R-02: Vibe coding hits a wall on ML infrastructure (MEDIUM/HIGH) — mitigated by managed services
- R-03: Timeline overrun (MEDIUM/MEDIUM) — mitigated by clear priority split
- R-04: Seed data sourcing and processing time (MEDIUM/MEDIUM) — mitigated by starting smaller
- R-05: Semantic search quality on small dataset (LOW/MEDIUM) — mitigated by diverse seed selection

## 9. Open Questions

- OQ-1: Best CV model for camera motion extraction and classification (HIGH, before-build)
- OQ-2: Optimal cloud GPU service for video analysis (HIGH, before-build)
- OQ-3: Complete fixed camera movement taxonomy (HIGH, before-build)
- OQ-4: Best frontend framework for vibe-coded UI (HIGH, before-build)
- OQ-5: Script data sourcing and alignment (MEDIUM, during-build)
- OQ-6: Maximum shot length for accurate analysis (MEDIUM, during-build)
- OQ-7: Seed dataset shot selection (MEDIUM, during-build)
- OQ-8: Metadata overlay visualization approach (MEDIUM, during-build)
- OQ-9: Article series structure and publishing (LOW, post-launch)

## 10. Key Decisions

- KD-01: Reference library, not generation tool
- KD-02: Shot is the atomic unit
- KD-03: Fixed hardcoded camera movement taxonomy
- KD-04: Specialized CV model on cloud GPU
- KD-05: Human QA 0-5 rating IS the confidence metric
- KD-06: Entire project built through AI agent prompting only
- KD-07: Frontend quality over pipeline completeness
- KD-08: Server-hosted seed data for best employer experience

## 11. Elicitation Log

9 techniques used, 1 advanced elicitation method. 116 ideas generated (floor: 100).

## 12. Visual Direction (Light)

**Mood:** Technical precision meets cinematic elegance. Dense with information but organized with clarity.

**Visual references:** Object detection annotation UIs (elevated), ShotDeck, CamCloneMaster, Spotify

**Hero visual moment:** Metadata overlay on video playback

**Anti-goals:** Not a bland dashboard. Not a generic SaaS template. Not academic or raw.
