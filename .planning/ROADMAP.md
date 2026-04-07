# Roadmap: MetroVision concerns remediation

## Overview

This milestone delivers phased hardening and alignment work traced to `.planning/codebase/CONCERNS.md` (2026-04-07). Early phases fix **truth in docs and constraints**, then **correctness and schema integrity**, **security boundaries**, **rate limits and platform fit**, **fragile modules**, and finally **tests plus observability** so regressions surface before production.

## Phases

**Phase Numbering:** Integer phases are sequential. Decimal phases (e.g. 3.1) are reserved for urgent insertions if needed.

- [x] **Phase 1: Documentation & constraint alignment** — Kiln/AGENTS accuracy; Drizzle policy; onboarding scripts; naming
- [x] **Phase 2: Correctness & schema integrity** — API auth crypto import; worker vs app Drizzle schema drift
- [x] **Phase 3: Security & exposure** — LLM route abuse; API key transport; `process-scene` exposure; image remote patterns
- [x] **Phase 4: Rate limits & heavy-work boundaries** — Worker/RAG/agent Gemini limiting; semantic search fallback; `process-scene` stance vs AC-01/AC-20
- [x] **Phase 5: Fragile modules** — Taxonomy TS/Python parity; D3 and large client components
- [ ] **Phase 6: Tests & observability** — Baseline automated tests, CI, structured logging

## Phase Details

### Phase 1: Documentation & constraint alignment

**Goal:** Operators and agents see documentation that matches the repository; constraint narratives (AC-14, AC-23) and onboarding commands work or are honestly scoped.

**Depends on:** Nothing (first phase)

**Traceability (CONCERNS.md):** Tech debt — Kiln/codebase-state & AC-23; Drizzle vs AC-14; AGENTS.md `db:seed`; package naming

**Success Criteria** (what must be TRUE):

1. `.kiln/docs/codebase-state.md` and related plan references describe only routes/paths that exist (no stale `detect-shots` unless restored).
2. Drizzle versioning has a single explicit policy: either docs/constraints updated for `^0.45.x`, or code downgraded with verified compatibility—no split brain.
3. `AGENTS.md` documents only scripts that exist, or `db:seed` / `src/db/seed.ts` is implemented.
4. Package display name in docs vs `package.json` is consistent (MetroVision vs SceneDeck) with a stated canonical label.

**Plans:** 4 plans

Plans:

- [x] 01-01: Reconcile `.kiln/docs/codebase-state.md`, `.kiln/master-plan.md`, and AC-23 checklists with live `src/app/api/**` tree
- [x] 01-02: Resolve Drizzle ORM version vs AC-14 / `AGENTS.md` (document chosen line + migration notes or pin and test)
- [x] 01-03: Add `pnpm db:seed` and `src/db/seed.ts` **or** remove seed references from `AGENTS.md` and other docs
- [x] 01-04: Align product/package naming across `AGENTS.md`, README, and `package.json`

---

### Phase 2: Correctness & schema integrity

**Goal:** Eliminate sharp correctness bugs and silent schema drift between services.

**Depends on:** Phase 1

**Traceability (CONCERNS.md):** Known bugs — `api-auth` `crypto`; Tech debt — dual Drizzle schemas

**Success Criteria** (what must be TRUE):

1. `generateApiKey` / `src/lib/api-auth.ts` uses explicit Node crypto imports (e.g. `randomUUID` from `node:crypto`) with no reliance on ambiguous globals.
2. Worker and app cannot drift on shared tables without detection: shared schema module, workspace import, or CI diff of exported shapes.

**Plans:** 2 plans

Plans:

- [x] 02-01: Fix `src/lib/api-auth.ts` imports and UUID generation per Node `crypto` best practice
- [x] 02-02: Align worker `films.source_url`, add `check:schema-drift`, document `shot_metadata` gap

---

### Phase 3: Security & exposure

**Goal:** Reduce cost/abuse and data-leak surfaces for a public deployment while respecting AC-21 (no end-user auth).

**Depends on:** Phase 2

**Traceability (CONCERNS.md):** Security — LLM proxies; API keys in query strings; `process-scene` path trust; `next.config.ts` images

**Success Criteria** (what must be TRUE):

1. LLM-heavy routes (`agent/chat`, `rag`, etc.) have a documented production posture: optional shared secret, edge rate limits, and/or deploy guidance that matches operator intent.
2. API keys for integrators are accepted via `Authorization` (Bearer); query-string `api_key` is deprecated or removed with migration note.
3. `process-scene` is not publicly exploitable for arbitrary filesystem read: auth, network restriction, or documented “local operator only” with runtime guard.
4. `next.config.ts` `images.remotePatterns` is narrowed toward known hosts (S3, TMDB, etc.) where feasible.

**Plans:** 4 plans

Plans:

- [x] 03-01: Define and implement production guards for public Gemini spend routes (header secret, edge limits, env flags)
- [x] 03-02: Deprecate or remove `?api_key=` from `validateApiKey`; update integrator docs
- [x] 03-03: Harden `src/app/api/process-scene/route.ts` for deployment model (auth, allowlist, or explicit disable on Vercel)
- [x] 03-04: Tighten `images.remotePatterns` in `next.config.ts` to known CDNs/buckets

---

### Phase 4: Rate limits & heavy-work boundaries

**Goal:** Uniform AC-07 compliance and clear separation of serverless vs worker/Python work.

**Depends on:** Phase 3

**Traceability (CONCERNS.md):** Performance — `process-scene`; semantic fallback; worker parallel Gemini; RAG/agent without limiter

**Success Criteria** (what must be TRUE):

1. Worker shot classification / embeddings use the same rate limiter/token pattern as other Gemini callers (reuse or extract shared module).
2. `rag` and `agent/chat` wrap outbound model calls with `acquireToken` (or equivalent) from `src/lib/rate-limiter.ts`.
3. Semantic search: on vector failure, operators get visibility (log/metric/alert) and a documented scale posture for ILIKE fallback.
4. `process-scene` on Vercel is removed, gated, or documented as non-canonical; canonical ingest path documented as worker SSE + Python batch per AC-20.

**Plans:** 4 plans

Plans:

- [x] 04-01: Add rate limiting to `worker/src/ingest.ts` Gemini paths consistent with `src/lib/rate-limiter.ts` / `pipeline` patterns
- [x] 04-02: Add `acquireToken` (or shared wrapper) to `src/app/api/rag/route.ts` and `src/app/api/agent/chat/route.ts`
- [x] 04-03: Instrument and document `searchShots` vector failure fallback in `src/db/queries.ts`
- [x] 04-04: Finalize `process-scene` stance: relocate, feature-flag off serverless, or operator-only; update docs

---

### Phase 5: Fragile modules

**Goal:** Reduce taxonomy and UI fragility with automation and targeted lint hygiene.

**Depends on:** Phase 4

**Traceability (CONCERNS.md):** Fragile areas — taxonomy sync; D3 visualize; large client components with eslint disables

**Success Criteria** (what must be TRUE):

1. Automated check (script, test, or CI step) fails if `src/lib/taxonomy.ts` and `pipeline/taxonomy.py` keys/sets diverge.
2. Visualize and review components: blanket `eslint-disable` for hooks/`any` reduced or scoped with justified patterns (AC-16 friendly).

**Plans:** 2 plans

Plans:

- [x] 05-01: Add taxonomy parity verification (comparisons + CI hook)
- [x] 05-02: Tighten `src/components/visualize/*` and large client components (e.g. review workspace, pipeline viz) hook/deps and typings

---

### Phase 6: Tests & observability

**Goal:** Regressions in APIs, worker, and taxonomy surface in CI; production debugging has a baseline.

**Depends on:** Phase 5

**Traceability (CONCERNS.md):** Missing tests; test coverage gaps; no centralized observability

**Success Criteria** (what must be TRUE):

1. Repo has a runnable test command (e.g. Vitest) with initial coverage of critical API helpers, auth, and at least one route contract.
2. CI runs lint, typecheck/build, and tests on push/PR.
3. Error reporting uses a consistent structured pattern (or APM hook) for hot API paths—no longer only ad-hoc `console.error`.

**Plans:** 3 plans

Plans:

- [ ] 06-01: Introduce test runner and first tranche of unit/integration tests (`src/`, `worker/` as appropriate)
- [ ] 06-02: Add GitHub Actions (or chosen CI) for `pnpm lint`, `pnpm build`, and tests
- [ ] 06-03: Structured logging or observability spike for API and worker failure paths

---

## Progress

**Execution order:** 1 → 2 → … → 6 (decimal insertions e.g. 3.1 sort between 3 and 4 if added)

| Phase | Name | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 1 | Documentation & constraint alignment | 4/4 | Complete | 2026-04-07 |
| 2 | Correctness & schema integrity | 2/2 | Complete | 2026-04-07 |
| 3 | Security & exposure | 4/4 | Complete | 2026-04-07 |
| 4 | Rate limits & heavy-work boundaries | 4/4 | Complete | 2026-04-07 |
| 5 | Fragile modules | 2/2 | Complete | 2026-04-07 |
| 6 | Tests & observability | 0/3 | Not started | — |
