# Vision Priorities — For Downstream Planners

## Non-Negotiables

1. **Zero manual coding by the operator.** This is both a constraint and a goal (KD-06, SC-09). Every line of code must come from AI agents. The operator prompts, approves, and relays — nothing else.
2. **Live deployed URL.** Not a local demo. Not a video walkthrough. A functioning web application at a real URL (SC-01).
3. **Metadata overlay on video playback.** This is the hero visual moment. It must be visually striking and screen-recordable (SC-05, Visual Direction). This is the single most important UI element.
4. **Human QA verification system.** The 0-5 accuracy rating is the confidence metric — there is no separate AI confidence score (KD-05, SC-06). All seed data must be 100% verified.
5. **Fixed camera movement taxonomy.** No fuzzy or probabilistic classification. A dolly is always a dolly (KD-03, Goal 3).

## Core Features (Must Ship)

- Searchable database with semantic/natural language search (SC-03)
- Directory browsing with filters: film, director, camera motion type, tags (SC-04)
- Metadata overlay rendering on video playback (SC-05)
- Human QA verification workflow (SC-06)
- Data pipeline that ingests at least one scene end-to-end (SC-08)
- Data export in at least one format (SC-07)
- 50-100 iconic shots with Tier 1 metadata (SC-02)

## Nice-to-Have Features (Ship If Time Allows)

- MCP plugin for external tool integration
- Tier 2 and Tier 3 metadata beyond Tier 1
- Multiple data export formats (API + CSV + JSON vs. just one)
- ComfyUI node integration
- Article series documentation (Goal 9 — can be post-launch)

## Where Quality Matters Most

1. **Frontend UI and visual experience** — explicitly prioritized over pipeline completeness (KD-07). If time runs short, the UI must be amazing even if the pipeline needs human correction.
2. **Metadata accuracy** — 100% human-verified for seed data. No "good enough" approximations in the demo dataset.
3. **First-visit impression** — the portfolio evaluator persona drives this. A VP of Product should be able to interact meaningfully within 30 seconds of landing.
4. **Video playback with overlay** — this is the differentiator. It must feel cinematic and precise, not academic or raw.

## Operator Preferences and Sensitivities

- **Art house cinema focus.** The seed dataset should be iconic, curated shots — not random clips. Think Lynch, Safdie brothers, visually distinctive filmmakers.
- **"Not a bland dashboard."** The operator has strong aesthetic sensibilities. Generic SaaS templates, academic UIs, and raw data displays are explicitly anti-goals.
- **Process documentation matters.** The operator is a director-level PM demonstrating agentic AI workflows. The how-it-was-built story is part of the portfolio value.
- **Community-minded design.** Even in v1, contribution should feel like a natural part of the experience, not a gated feature.
- **Pragmatic about unknowns.** The operator accepted multiple TBD items (CV model, frontend framework, database) rather than making premature decisions. Downstream agents have latitude to recommend — with operator approval of tradeoffs.
- **Budget is flexible but not infinite.** "Few hundred dollars per month" as a general range. Optimize for quality within reason, not minimum cost.
- **Speed of setup matters for stack choices.** The philosophy is explicitly: optimize for speed, vibe-code compatibility, and demo quality — not scalability.
