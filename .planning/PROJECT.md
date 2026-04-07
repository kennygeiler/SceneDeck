# MetroVision (SceneDeck)

## What This Is

MetroVision (SceneDeck) is a platform for structured camera movement analysis at cinematic scale: Next.js app, Neon Postgres + pgvector, TS ingest worker, and Python batch pipeline for shot detection and classification.

## Core Value

Trustworthy shot metadata and search—taxonomy, ingest, and APIs stay aligned so researchers and tools can rely on the data model.

## Requirements

### Validated

(None for this remediation track—populate as phases ship.)

### Active

- [x] **REQ-DOC-01** — Kiln/architecture docs and `AGENTS.md` match the live repo (no phantom routes or scripts). *(Phase 1, 2026-04-07)*
- [ ] **REQ-CORR-01** — `generateApiKey` / `src/lib/api-auth.ts` uses explicit `node:crypto` (`randomUUID`), not the global `crypto` binding.
- [ ] **REQ-SCHEMA-01** — App and worker database shapes cannot drift silently (automated check for shared tables; known `shot_metadata` gap documented).
- [ ] **REQ-SEC-01** — Public LLM-heavy endpoints have an explicit abuse/cost posture; local-only routes are not deployable by mistake.
- [ ] **REQ-RL-01** — All Gemini (and comparable) outbound calls respect the same rate-limiting policy (AC-07).
- [ ] **REQ-QA-01** — Automated tests and CI cover critical API, worker, and taxonomy parity paths.

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
*Last updated: 2026-04-07 after Phase 2 planning (REQ-CORR-01 added)*
