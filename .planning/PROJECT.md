# MetroVision (SceneDeck)

## What This Is

MetroVision (SceneDeck) is a platform for structured camera movement analysis at cinematic scale: Next.js app, Neon Postgres + pgvector, TS ingest worker, and Python batch pipeline for shot detection and classification.

## Core Value

**Shot-first** compositional metadata and search: taxonomy, ingest, and APIs stay aligned so learners, researchers, and tools can rely on **per-shot** rows. Automatic `scenes` groupings are **convenience** (model-derived), not screenplay ground truth; **user-defined** shot collections are the intended way for students and fans to name their own “scenes” for study (product roadmap).

**Proof-point docs:** [`.planning/research/pipeline-whitepaper.md`](research/pipeline-whitepaper.md) (pipeline I/O and fidelity), [`.planning/research/ingest-accuracy-hitl-strategy.md`](research/ingest-accuracy-hitl-strategy.md) (strategy, constraints, upgrade steps).

## Requirements

### Validated

- [x] **REQ-DOC-01** — Kiln/architecture docs and `AGENTS.md` match the live repo (no phantom routes or scripts). *(Phase 1, 2026-04-07)*
- [x] **REQ-CORR-01** — `generateApiKey` / `src/lib/api-auth.ts` uses explicit `node:crypto` (`randomUUID`), not the global `crypto` binding. *(Phase 2, 02-01, 2026-04-07)*
- [x] **REQ-SCHEMA-01** — App and worker cannot drift silently on shared tables (`pnpm check:schema-drift`); `shot_metadata` gap explicit via script warning + CONCERNS. *(Phase 2, 02-02, 2026-04-07)*
- [x] **REQ-SEC-01** — LLM route `POST /api/rag` supports optional `METROVISION_LLM_GATE_SECRET`; v1 API keys Bearer-first with legacy query opt-in; `process-scene` blocked on Vercel + optional secret; image remote patterns narrowed. *(Phase 3, 03-01–03-04, 2026-04-07; chat route removed in consolidation.)*
- [x] **REQ-RL-01** — Gemini paths use shared `acquireToken` / worker mirror; `searchShots` logs vector fallback; AGENTS documents limits and canonical ingest (AC-07, AC-20). *(Phase 4, 04-01–04-04, 2026-04-07)*
- [x] **REQ-TAX-01** — `pnpm check:taxonomy` + GitHub Action on taxonomy file changes; TS/Python slug sets stay aligned (AC-02). *(Phase 5, 05-01, 2026-04-07)*

### Active

- [ ] **REQ-QA-01** — Automated tests and CI cover critical API and worker paths (taxonomy parity covered by REQ-TAX-01).
- [ ] **REQ-BT-01** — Global **`boundary_cut_presets`** (JSON config) + migration/seed aligned with **CEMENTED** boundary defaults. *(Phase 10, 10-01)*
- [ ] **REQ-BT-02** — **Gold revision history**, **boundary eval run** persistence + scoring API, worker **detect job** applying preset without relying on global env alone. *(Phase 10, 10-01)*
- [ ] **REQ-BT-03** — **Tuning workspace UI** (`/tuning` extension), optional **`films.boundaryCutPresetId`**, docs quickstart; **classification unchanged**. *(Phase 10, 10-02)*

### Out of Scope (for this roadmap)

- End-user authentication product (AC-21 remains “public”); optional operator shared secrets and edge limits only.
- Re-architecting the entire media pipeline—phases align boundaries with existing worker/Python design, not greenfield rewrite.

## Context

Phased delivery is driven by `.planning/codebase/CONCERNS.md` (audit 2026-04-07): documentation drift, schema duplication, security edges, uneven rate limiting, fragile taxonomy/D3 areas, and missing tests/observability.

## Constraints

- **Platform**: Vercel serverless limits (AC-01); heavy FFmpeg/Python belongs on worker or batch pipeline.
- **Data**: Neon + Drizzle; taxonomy must stay synchronized between `src/lib/taxonomy.ts` and `pipeline/taxonomy.py` (AC-02).
- **Operations**: No Redis/BullMQ; Postgres job patterns per project constraints.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Roadmap sourced from CONCERNS.md | Structured remediation beats ad-hoc fixes | ✓ Good |
| Drizzle version | Document `^0.45.1` as standard (AC-14) | ✓ Good |

---
*Last updated: 2026-04-07 — added learning-product stance, links to pipeline whitepaper and ingest strategy.*
