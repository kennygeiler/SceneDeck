# Phase 10 — Research: boundary cut eval and tuning product

**Gathered:** 2026-04-11  
**Status:** Complete (product decisions locked)

## Product decisions (locked)

| Topic | Decision |
|--------|-----------|
| **Preset scope** | **Global** — boundary cut presets are shared across all operators/films (not per-user namespaces in v1). |
| **Gold data** | **Editable with full history** — the “current” gold for a scope can change; every material edit is retained as an auditable revision (append-only or version chain). |
| **Cost / quotas** | **Unlimited for now** — no job caps or rate budgets in v1; revisit when abuse or spend appears. |
| **Classification** | **Out of scope for this phase** — Gemini / slot classification stays **one global stack** for everyone; this phase is **only cut detection, merge, fusion, extras, and eval**. |
| **Scope name** | **Cut eval and tuning** — select a **boundary policy preset**, build or extend **hand gold**, run **predicted cuts** on the same clock, view **P/R/F1**, **miss lists**, and optional timing deltas; then **apply** the winning preset to **ingest** for that title. |

## Terminology

- **Preset** (boundary policy): structured knob set aligned with production code — e.g. `METROVISION_BOUNDARY_DETECTOR` mode, `METROVISION_BOUNDARY_MERGE_GAP_SEC`, `detector` request field when not in ensemble, `boundaryFusionPolicy`, optional extra-cut source references. Not the same as **`GEMINI_CLASSIFY_MODEL`** (explicitly excluded here).
- **Gold revision**: a versioned snapshot of human `cutsSec` (and metadata: window, film, timebase notes) that can supersede a prior revision without deleting history.
- **Eval run**: paired gold revision + predicted artifact + scored metrics + provenance (preset id, env snapshot, tolerance).

## Findings (technical)

- **Ingest today** reads boundary behavior from **process environment** and ingest body fields (`detectShotsForIngest` in `src/lib/ingest-pipeline.ts`, `src/lib/boundary-ensemble.ts`). Product must add a **persisted preset** and **per-film or per-job override** path on the **worker** (or equivalent long-runner); Vercel serverless is not the primary detect host (AC-01 / `docs/tuning-flow.md`).
- **Building blocks:** `docs/tuning-flow.md` (staged workflow), `/eval/gold-annotate`, `eval_artifacts` (`src/db/schema.ts`), CLIs `detect:export-cuts`, `eval:pipeline`, `eval:boundary-misses`, shared `src/lib/eval-cut-json.ts` / `evalBoundaryCuts`.
- **Gap:** No DB table for **global presets**; no first-class **gold revision** graph; `/tuning` is **documentation + cemented Ran row**, not an interactive workspace; worker does not yet accept a **preset payload** that maps 1:1 to `detectShotsForIngest` options.

## Validation architecture (phase-level)

- **Unit:** Preset JSON validation (Zod or shared type), revision ordering, `evalBoundaryCuts` unchanged contract.
- **Integration:** Fixture film or stub video path on worker dev; one gold revision + one predicted artifact → API returns same F1 as `eval:pipeline` for equivalent JSON.
- **Product:** Operator can complete: create gold revision → pick global preset → run job → read metrics → attach preset to ingest for that film (or document manual env mirror until auto-apply ships).

## RESEARCH COMPLETE
