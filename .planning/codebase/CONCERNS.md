# Codebase Concerns

**Analysis Date:** 2026-04-11

## Tech Debt

**Python classification module out of sync with composition taxonomy:**
- Issue: `pipeline/classify.py` imports `MOVEMENT_TYPES`, `DIRECTIONS`, `SPEEDS`, `SPECIAL_ANGLES` from `pipeline/taxonomy.py`, but those symbols are not defined in `pipeline/taxonomy.py` (composition-only slugs: framing, depth, blocking, symmetry, dominant lines, lighting, color temperature, shot size, angles, duration). Any run of `python main.py` that reaches `classify_shot` will fail at import time once the `google` SDK is installed.
- Files: `pipeline/classify.py`, `pipeline/taxonomy.py`, `pipeline/main.py`
- Impact: Bulk / CLI Python classification path is not runnable without rewriting the prompt and validation to match TS / `write_db.py` expectations.
- Fix approach: Align `classify.py` JSON schema and prompt with `src/lib/taxonomy.ts` + `pipeline/taxonomy.py`; update `DEFAULT_CLASSIFICATION` and validators; extend CI to `python -c "import pipeline.classify"` (with venv) or a minimal import smoke after `pip install -r requirements.txt`.

**Monolithic modules (high change cost, review burden):**
- Issue: Several files exceed ~1k lines and mix UI, data fetching, and domain logic.
- Files: `src/components/eval/gold-annotate-workspace.tsx`, `src/db/queries.ts`, `src/lib/object-detection.ts`, `src/lib/ingest-pipeline.ts`, `src/components/ingest/pipeline-viz.tsx`, `src/components/review/review-splits-workspace.tsx`
- Impact: Regressions are easy to miss; merges conflict often; behavior is hard to test in isolation.
- Fix approach: Extract query helpers from `src/db/queries.ts`, split ingest stages in `src/lib/ingest-pipeline.ts`, and peel presentational subcomponents from the largest client workspaces.

**Worker loads shared TS via `default ?? named` interop:**
- Issue: `worker/src/ingest.ts` repeatedly does `(module as { default?: T }).default ?? module` for many `../../src/lib/*.js` imports to survive ESM/CJS shape differences.
- Files: `worker/src/ingest.ts`
- Impact: Easy to break the worker when refactoring exports in `src/lib/*` without running `pnpm check:worker` and a dev ingest smoke test.
- Fix approach: Standardize shared modules on a single export style or add a tiny `interopDefault` helper + contract tests.

**Documentation drift (movement taxonomy):**
- Issue: `.kiln/docs/arch-constraints.md` AC-02 still describes camera movement slug parity between TS and Python; the live constraint in `AGENTS.md` / `src/lib/taxonomy.ts` is composition-first with movement removed from the shared taxonomy.
- Files: `.kiln/docs/arch-constraints.md`, `AGENTS.md`, `src/lib/taxonomy.ts`
- Impact: Planners may reintroduce removed enums or mis-prioritize parity checks.
- Fix approach: Update kiln AC-02 to match `scripts/check-taxonomy-parity.ts` and current `pipeline/taxonomy.py` fields.

## Known Bugs

**Python `classify` import failure (blocked pipeline stage):**
- Symptoms: ImportError for `MOVEMENT_TYPES` / `SPECIAL_ANGLES` / etc. when loading `pipeline.classify` after dependencies are installed.
- Files: `pipeline/classify.py`, `pipeline/taxonomy.py`
- Trigger: `python -m pipeline.main` (or direct `import classify`) in an environment with `google-genai` installed.
- Workaround: Use the TS ingest worker (`worker/src/ingest.ts`) or Next ingest paths for classification until Python classify is realigned.

## Security Considerations

**Public v1 surface (by design) with cost and abuse exposure:**
- Risk: No end-user auth (`AGENTS.md` AC-21). Routes that trigger Gemini, OpenAI embeddings, ffmpeg, or large uploads can be abused if deployed without optional gates.
- Files: `src/app/api/rag/route.ts` (`src/lib/llm-route-gate.ts`), `src/app/api/process-scene/route.ts`, `src/app/api/upload-video/route.ts`, `src/app/api/ingest-film/stream/route.ts`, `worker/src/server.ts`
- Current mitigation: Optional `METROVISION_LLM_GATE_SECRET` + `x-metrovision-llm-gate` on gated LLM routes; optional `METROVISION_PROCESS_SCENE_SECRET` on process-scene; eval artifact admin bearer (`src/lib/eval-artifact-gate.ts`); `METROVISION_ALLOW_API_KEY_QUERY` documented as off by default (`src/lib/api-auth.ts`).
- Recommendations: Treat the Express worker as trusted-network or add shared-secret / mTLS for `POST /api/ingest-film/stream` and `POST /api/boundary-detect` when exposed beyond localhost; restrict `POST /api/upload-video` (auth or same-origin-only) on public hosts; keep production secrets set for RAG and eval admin.

**Worker health endpoint metadata:**
- Risk: `GET /health` returns booleans such as `hasGoogleKey`, `hasAws`, `hasDb` (`worker/src/server.ts`), which aids reconnaissance.
- Current mitigation: Low sensitivity (no secret values).
- Recommendations: Omit credential flags in production or protect `/health` behind the same operator controls as ingest.

**Unauthenticated video upload to local temp:**
- Risk: `src/app/api/upload-video/route.ts` accepts arbitrary multipart uploads and writes under `tmpdir()` without authentication.
- Current mitigation: None in route code.
- Recommendations: Same as worker — do not expose without network controls; add size quotas and auth if the route is public.

## Performance Bottlenecks

**Semantic search: embedding path vs ILIKE fallback:**
- Problem: When `shot_embeddings` is empty or pgvector/query fails, `searchShots` falls back to ILIKE (`src/db/queries.ts`), which does not scale like vector search on large corpora.
- Files: `src/db/queries.ts`
- Cause: Missing or failed embedding index; dimension/extension issues.
- Improvement path: Run `pnpm db:embeddings` after ingest; monitor `[searchShots]` logs; ensure pgvector extension per `AGENTS.md` / AC-03.

**Long-running ingest on serverless:**
- Problem: `src/app/api/ingest-film/stream/route.ts` sets `maxDuration` up to 800s and can run heavy work unless proxied to the worker via `INGEST_WORKER_URL` / `NEXT_PUBLIC_WORKER_URL` (`src/lib/ingest-worker-delegate.ts`).
- Files: `src/app/api/ingest-film/stream/route.ts`
- Cause: Platform timeout and cold-start limits vs film-length jobs.
- Improvement path: Always proxy production ingest to the TS worker; keep worker on a long-lived host.

**Large DB query module:**
- Problem: `src/db/queries.ts` centralizes many hot paths; a single regression affects browse, search, shot detail, and visualize.
- Files: `src/db/queries.ts`
- Cause: Organic growth without vertical splits.
- Improvement path: Split by domain (films, shots, search, eval) and add targeted benchmarks for worst joins.

## Fragile Areas

**Ingest pipeline orchestration:**
- Files: `src/lib/ingest-pipeline.ts`, `worker/src/ingest.ts`, `src/app/api/ingest-film/stream/route.ts`
- Why fragile: Boundary detection env flags, preset resolution, timeline windows, Gemini calls, and S3 uploads interact; small env or schema changes surface late.
- Safe modification: Run `pnpm check:taxonomy`, `pnpm check:schema-drift`, `pnpm test`, and a short ingest smoke on a clip after changes.
- Test coverage: Logic-heavy pieces have unit tests under `src/lib/__tests__/` (boundary, ingest timeline, worker origin); full ingest is not covered end-to-end in CI.

**D3 visualization components:**
- Files: `src/components/visualize/*.tsx`, constraints in `.kiln/docs/arch-constraints.md` AC-09
- Why fragile: Partial or malformed datasets cause render failures; `useEffect` + animation loops must clean up (AC-16).
- Safe modification: Feed complete server-fetched payloads; verify cleanup on navigation in manual QA.

**Optional `dangerouslySetInnerHTML` for styles:**
- Files: `src/components/ingest/pipeline-viz.tsx`
- Why fragile: Any future change that interpolates untrusted strings into `STYLES` would widen XSS risk; current use is static CSS injection.
- Safe modification: Keep `__html` strictly static or migrate to CSS modules / Tailwind.

## Scaling Limits

**Neon storage (vectors and corpus):**
- Current capacity: Documented in AC-11 (`.kiln/docs/arch-constraints.md`) — rough shot counts for 0.5 GB at 768-dim embeddings.
- Limit: Free-tier storage and HTTP driver connection patterns on spikes.
- Scaling path: Neon tier upgrade; monitor storage; batch embedding jobs off critical request path.

**Gemini / OpenAI quotas:**
- Limit: Rate limits and token spend under anonymous or wide-open deploys.
- Scaling path: `src/lib/rate-limiter.ts` + `pipeline/rate_limiter.py`; optional LLM gate; tier upgrades.

## Dependencies at Risk

**Google GenAI SDK + Python classify alignment:**
- Risk: `pipeline/classify.py` is incompatible with current `pipeline/taxonomy.py`; upgrading `google-genai` without fixing classify will not restore the pipeline.
- Impact: Python batch classification unusable until fixed.
- Migration plan: Rewrite classify prompt/output to composition fields; validate against `pipeline/write_db.py` column expectations.

## Missing Critical Features

**Not applicable (product scope):** Authentication and billing are explicitly deferred (AC-21). Track as product risk, not an implementation gap in-repo.

## Test Coverage Gaps

**API Route Handlers and pages:**
- What's not tested: Most `src/app/api/**/route.ts` handlers and large client pages have no automated tests in CI.
- Files: e.g. `src/app/api/upload-video/route.ts`, `src/app/api/ingest-film/stream/route.ts`, `src/app/(site)/ingest/page.tsx`
- Risk: Regressions in HTTP contracts, auth gates, and streaming only surface manually or in production.
- Priority: Medium — add focused route tests (Vitest + `Request` mocks) for upload size, gating headers, and delegate-to-worker branches.

**Worker Express server:**
- What's not tested: `worker/src/server.ts`, CORS matrix, and SSE handler integration.
- Files: `worker/src/server.ts`, `worker/src/ingest.ts`
- Risk: CORS or body-limit misconfiguration breaks hosted ingest UIs.
- Priority: Medium.

**Python pipeline (beyond taxonomy script):**
- What's not tested: CI runs `pnpm check:taxonomy` and `pnpm eval:smoke` (TS); Python `main.py` / `classify.py` are not exercised in `.github/workflows/ci.yml`.
- Files: `pipeline/main.py`, `pipeline/classify.py`
- Risk: The classify/taxonomy drift went undetected by CI.
- Priority: High until classify is fixed, then add a minimal import or dry-run job.

---

*Concerns audit: 2026-04-11*
