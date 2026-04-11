# Phase 10 — Validation: boundary cut eval and tuning product

**Phase:** 10-shot-boundary-cut-eval-and-tuning-product

## UAT — must pass before “phase complete”

1. **Global presets** — At least one **seed preset** exists in DB matching today’s recommended production stack (e.g. ensemble + merge gap from `eval/runs/STATUS.md` **CEMENTED** row). Operators can **list** presets; new presets can be **created** (admin or open, per deploy policy).
2. **Gold versioning** — For a chosen film (and optional time window), an operator can **save gold**; a subsequent **edit** creates a **new revision** while **prior revisions remain queryable** (history UI or API).
3. **Cut eval run** — Given a gold revision and a selected global preset, the system can produce **predicted `cutsSec`** on the worker-capable path and compute **precision / recall / F1** at a configured **tolerance** (default 0.5 s), consistent with `eval:pipeline` / `evalBoundaryCuts`.
4. **Transparency** — Each eval run exposes **FN/FP lists** (or links to the same data as `eval:boundary-misses`) and stores **provenance**: preset id, merge gap, detector mode label, fusion policy, optional extras flag.
5. **Ingest bridge** — Documented **path to production ingest** with the chosen preset: either **automatic** (film or job references `boundaryCutPresetId`) or **explicit operator checklist** (env vars + ingest body) until automation lands — must be unambiguous in `AGENTS.md` or `docs/tuning-flow.md`.
6. **Classification unchanged** — No UI or API in this phase changes **classification model** or per-shot composition slots; spot-check that ingest classification path is untouched by preset wiring.

## Non-goals (this phase)

- Per-user preset namespaces.
- Spend caps or job throttles.
- Tuning **composition** / Gemini **classification** models.

## Regression

- `pnpm test`, `pnpm eval:smoke`, and existing Ran **CEMENTED** baseline docs remain valid; new code does not weaken boundary merge/fusion defaults without ADR or STATUS update.
