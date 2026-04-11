# Codebase Concerns

**Analysis Date:** 2026-04-07

## Tech Debt

**Documentation vs. repository state (AC-23):**
- Issue: `.kiln/docs/codebase-state.md` still states `src/app/api/detect-shots/route.ts` exists as a Python shell-out side channel. That route is not present under `src/app/api/` (only routes such as `process-scene`, `ingest-film`, `detect-objects`, `v1/*`, etc.).
- Files: `.kiln/docs/codebase-state.md`, `.kiln/docs/arch-constraints.md` (AC-23 narrative references `detect-shots`)
- Impact: Planners and agents may schedule duplicate consolidation work or misreport compliance.
- Fix approach: Regenerate or hand-edit `.kiln/docs/codebase-state.md` and any checklists in `.kiln/master-plan.md` / `.kiln/plans/*.md` so they match the live tree; treat AC-23 as satisfied only after explicit verification of all remaining serverless media paths.

**Drizzle ORM version vs. constraint (AC-14):**
- Issue: `drizzle-orm` is declared at `^0.45.1` in root `package.json` and `worker/package.json`, while `.kiln/docs/arch-constraints.md` AC-14 and `AGENTS.md` still specify pinning to `~0.38.x`.
- Files: `package.json`, `worker/package.json`, `.kiln/docs/arch-constraints.md`, `AGENTS.md`
- Impact: Constraint docs and agent guidance are misleading; upgrade-induced API drift is possible when copying snippets from older Drizzle docs.
- Fix approach: Either amend AC-14 / `AGENTS.md` to the chosen major line and document migration notes, or downgrade and regression-test if strict compliance is required.

**AGENTS.md scripts vs. root `package.json`:**
- Issue: `AGENTS.md` documents `pnpm db:seed` (`tsx src/db/seed.ts`), but root `package.json` has no `db:seed` script and no `src/db/seed.ts` file was found in the tree.
- Files: `AGENTS.md`, `package.json`
- Impact: Onboarding commands fail; operators assume seeding exists.
- Fix approach: Add the script and seed module, or remove the command from `AGENTS.md`.

**Dual Drizzle schema definitions:** *(resolved 2026-04)* — `worker/src/db.ts` imports `src/db/schema.ts` directly; `scripts/check-schema-drift.ts` asserts shared tables exist. Keep worker imports pointed at the app schema when adding tables.

**Package naming drift:**
- Issue: Root `package.json` uses `"name": "metrovision"` while historical references still say "scenedeck" (`AGENTS.md` config section).
- Files: `package.json`, `AGENTS.md`
- Impact: Low; mainly confusion in docs and tooling.
- Fix approach: Align naming in docs or rename package consistently.

## Known Bugs

**`generateApiKey` and `crypto` reference:**
- Issue: `src/lib/api-auth.ts` imports `createHash` from `node:crypto` but calls `crypto.randomUUID()` without importing `crypto` as a namespace. Behavior depends on global `crypto` (runtime-specific); TypeScript strict setups may flag this.
- Files: `src/lib/api-auth.ts`
- Trigger: Calling `generateApiKey` in environments where global `crypto` is not the same as Web Crypto API.
- Workaround: Use `import { createHash, randomUUID } from "node:crypto"` and `randomUUID()` for keys.

No `TODO` / `FIXME` / `HACK` / `XXX` markers were found in first-party trees `src/`, `worker/src/`, or `pipeline/` (grep); operational risk is in architecture and untested paths rather than commented stubs.

## Security Considerations

**Public, unauthenticated LLM proxy routes (cost & abuse):**
- Risk: Several route handlers accept arbitrary user input and spend server-side API quota (Gemini, OpenAI, retrieval) without API key checks. This aligns with AC-21 (no end-user auth) but increases operator risk.
- Files: `src/app/api/rag/route.ts` (POST `query` → retrieval + Gemini) and other ingest/process routes if exposed on a public deployment.
- Current mitigation: Relies on deployment boundary (not indexed, IP limits, Vercel protection) rather than application-level auth.
- Recommendations: Add optional shared-secret header for production, per-IP or token bucket at the edge, or restrict these routes to internal networks; monitor spend on Google/OpenAI dashboards.

**API keys in query strings:**
- Risk: `validateApiKey` in `src/lib/api-auth.ts` accepts `?api_key=` which can leak via logs, referrers, and browser history.
- Files: `src/lib/api-auth.ts`
- Current mitigation: Keys are stored hashed; Bearer header is preferred in docs.
- Recommendations: Deprecate query param in favor of `Authorization` only for external integrators.

**`process-scene` trusts server-local `videoPath`:**
- Risk: `POST` body supplies `videoPath`; the handler uses `access(payload.videoPath, constants.R_OK)` then reads that path. On a shared host, a caller who can hit the route could probe readable paths if the deployment exposes this API without network isolation.
- Files: `src/app/api/process-scene/route.ts`
- Current mitigation: Intended for operator-controlled environments with local disk access.
- Recommendations: Do not expose this route on public Vercel; require auth or restrict to same-origin admin tooling.

**Next.js image remote patterns:**
- Risk: `next.config.ts` allows `images.remotePatterns` for `https` and `http` with `hostname: "**"`, widening the surface for unexpected image domains.
- Files: `next.config.ts`
- Recommendations: Narrow to known CDNs (e.g., S3 host patterns, TMDB) when possible.

## Performance Bottlenecks

**Heavy serverless route: `process-scene`:**
- Problem: `src/app/api/process-scene/route.ts` runs `ffmpeg` via `spawn`, shells to Python for `pipeline.classify.classify_shot`, runs object detection and uploads — far beyond typical Vercel duration and binary availability.
- Files: `src/app/api/process-scene/route.ts`
- Cause: Monolithic route couples media processing with Next.js deployment model.
- Improvement path: Remove or gate behind self-hosted Node; canonical path should remain `worker/src/ingest.ts` (SSE) and Python batch worker per AC-20.

**Semantic search fallback:**
- Problem: On embedding/vector failures, `searchShots` falls back to ILIKE (`src/db/queries.ts`), which does not scale on large shot tables.
- Files: `src/db/queries.ts`
- Cause: Defensive fallback after caught errors.
- Improvement path: Alert on fallback, fix vector extension/connectivity, add indexes for common text filters.

**Worker concurrent Gemini calls:**
- ~~Problem: worker classify path lacked rate limit~~ *(resolved)* — worker now calls `classifyShot` from `src/lib/ingest-pipeline.ts`, which uses `acquireToken()` before Gemini.
- Files: `worker/src/ingest.ts`, `src/lib/ingest-pipeline.ts`, `pipeline/classify.py`

**RAG route — rate limiter:** *(resolved)* — `src/app/api/rag/route.ts` calls `acquireToken()` before Gemini.
- Files: `src/app/api/rag/route.ts`, `src/lib/rate-limiter.ts`

## Fragile Areas

**Taxonomy synchronization (AC-02):**
- Files: `src/lib/taxonomy.ts`, `pipeline/taxonomy.py`
- Why fragile: Any edit to one file without the other corrupts classification slugs vs. UI expectations.
- Safe modification: Single commit touching both; add a small script or test that compares key sets.
- Test coverage: No automated taxonomy parity test detected in-repo.

**D3 visualization components:**
- Files: `src/components/visualize/*.tsx` (e.g., `chord-diagram.tsx` uses multiple `eslint-disable` for `any` with D3 callbacks)
- Why fragile: D3 typings and React lifecycle interact easily with `requestAnimationFrame` and resize observers (AC-16).
- Safe modification: Always pair rAF with cleanup; run visual smoke tests after dependency upgrades.

**Large client components:**
- Files: `src/components/review/review-splits-workspace.tsx` (file-level `eslint-disable react-hooks/exhaustive-deps`), `src/components/ingest/pipeline-viz.tsx`
- Why fragile: Suppressed hook dependency warnings can hide stale-closure bugs.
- Safe modification: Replace blanket disables with scoped deps or `useCallback`/`useMemo` with correct lists.

## Scaling Limits

**Neon storage (AC-11):**
- Resource: Embeddings and media metadata growth.
- Current capacity: Documented in AC-11 (~166K shots at 768-dim on free tier assumptions).
- Limit: Storage and connection limits on Neon tier.
- Scaling path: Monitor Neon dashboard; upgrade tier; consider dimension reduction or archival.

**Vercel serverless timeout (AC-01):**
- Limit: 60s on route handlers.
- Affected code: Any route that runs subprocesses or long video work — notably `src/app/api/process-scene/route.ts`.
- Scaling path: Keep heavy work on `worker/` or Python pipeline only.

## Dependencies at Risk

**Drizzle + Neon stack:**
- Risk: Major Drizzle jumps (post-0.38) can change inferred types and Kit behavior.
- Files: `package.json`, `drizzle.config.ts`, `drizzle-kit` devDependency
- Migration plan: Pin intentionally, read Drizzle changelog before bumps, run `pnpm build` and `drizzle-kit` checks.

**TensorFlow.js / COCO-SSD in browser or API paths:**
- Files: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd` in `package.json`, used from `src/lib/object-detection.ts` (large surface)
- Risk: Bundle size, memory, and CPU on server when invoked from API routes.
- Impact: Cold starts and timeouts under load.

## Missing Critical Features

**Automated tests in application source:**
- Problem: No `*.test.ts` / `*.spec.ts` files under `src/` or `worker/src/` (excluding `node_modules`). No `.github/workflows` CI detected at repository root for lint/build/test.
- Blocks: Regressions in API contracts, taxonomy, and DB queries go unnoticed until manual QA.
- Priority: High for any production launch (AC-19 gate).

**Centralized observability:**
- Problem: Errors are largely `console.error` in route handlers (`src/app/api/*`, `src/db/queries.ts`) without structured logging or APM.
- Blocks: Production debugging and SLO tracking.

## Test Coverage Gaps

**API routes:**
- What's not tested: CRUD/search/export/batch/rag/process-scene behavior.
- Files: `src/app/api/**/route.ts`
- Risk: Breaking changes to JSON shapes and status codes.
- Priority: High.

**Worker ingest pipeline:**
- What's not tested: SSE event sequence, S3 upload failures, Gemini fallback paths in `worker/src/ingest.ts`.
- Files: `worker/src/ingest.ts`, `worker/src/server.ts`
- Risk: Silent `fallbackClassification()` under load without alerts.
- Priority: Medium.

**Python pipeline:**
- What's not tested: End-to-end `classify_shot`, batch worker queue semantics (no pytest discovery in this audit).
- Files: `pipeline/classify.py`, `pipeline/batch_worker.py`
- Risk: Rate limiter regressions and Gemini API changes.
- Priority: Medium.

## Research / ingest accuracy strategy

- **Strategy, constraints, learning-product stance, dev roadmap:** [`.planning/research/ingest-accuracy-hitl-strategy.md`](../research/ingest-accuracy-hitl-strategy.md)
- **Pipeline whitepaper (proof point — steps, tech, I/O, fidelity):** [`.planning/research/pipeline-whitepaper.md`](../research/pipeline-whitepaper.md)

---

*Concerns audit: 2026-04-07*
