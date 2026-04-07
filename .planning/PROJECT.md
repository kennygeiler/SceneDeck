# MetroVision (SceneDeck)

## What This Is

MetroVision (SceneDeck) is a platform for structured camera movement analysis at cinematic scale: Next.js app, Neon Postgres + pgvector, TS ingest worker, and Python batch pipeline for shot detection and classification.

## Core Value

Trustworthy shot metadata and search—taxonomy, ingest, and APIs stay aligned so researchers and tools can rely on the data model.

## Requirements

### Validated

- [x] **REQ-DOC-01** — Kiln/architecture docs and `AGENTS.md` match the live repo (no phantom routes or scripts). *(Phase 1, 2026-04-07)*
- [x] **REQ-CORR-01** — `generateApiKey` / `src/lib/api-auth.ts` uses explicit `node:crypto` (`randomUUID`), not the global `crypto` binding. *(Phase 2, 02-01, 2026-04-07)*
- [x] **REQ-SCHEMA-01** — App and worker cannot drift silently on shared tables (`pnpm check:schema-drift`); `shot_metadata` gap explicit via script warning + CONCERNS. *(Phase 2, 02-02, 2026-04-07)*
- [x] **REQ-SEC-01** — LLM routes (`/api/agent/chat`, `/api/rag`) support optional `METROVISION_LLM_GATE_SECRET`; v1 API keys Bearer-first with legacy query opt-in; `process-scene` blocked on Vercel + optional secret; image remote patterns narrowed. *(Phase 3, 03-01–03-04, 2026-04-07)*

### Active

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
*Last updated: 2026-04-07 after Phase 3 execution (REQ-SEC-01 validated)*
