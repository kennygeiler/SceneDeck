# Per-film boundary tuning flow (CLI today → in-app product)

This document **logs the intended tuning workflow** so operators (and future app UX) can repeat it: **sample window → human cuts → auto detect → metrics → adjust → re-run**. It complements **`eval/runs/STATUS.md`** (canonical baseline, **CEMENTED** production row, improvement tiers) and the in-app **`/tuning`** hub, plus **`eval/runs/README.md`** (append-only ledger) and **`eval/runs/*.json`** (structured run snapshots).

**Execution plan:** GSD **Phase 10** — [`.planning/phases/10-shot-boundary-cut-eval-and-tuning-product/`](../.planning/phases/10-shot-boundary-cut-eval-and-tuning-product/) (`10-RESEARCH.md`, `10-01-PLAN.md`, `10-02-PLAN.md`, `10-VALIDATION.md`). Locked product choices: **global** boundary presets, **gold editable with history**, **no cost caps v1**, **cut tuning only** (classification unchanged).

---

## Decision point (2026-04-10 — Ran `ranshort`, gold 71 interior cuts, tol 0.5 s)

**Recorded choice:** After **TransNet threshold × merge-gap sweeps** did **not** improve on **PyScene ensemble + merge gap 0.22** (registered numbers in **`eval/runs/STATUS.md`** — **F1 ~0.714**, **R ~0.63**), the next engineering investment is **false-negative–centric**: **enumerate missed gold times**, then **local second-pass / alternate cues** and **fusion / HITL** — **not** further TransNet threshold tuning on this clip alone.

**Roadmap:** GSD **Phases 7–11** in **`.planning/ROADMAP.md`** structure that path (FN list → local refinement → fusion → in-app HITL → multi-film corpus).

**Phase 7 (implemented):** **`pnpm eval:boundary-misses -- eval/gold/....json eval/predicted/....json [--tol 0.5] [--json]`** prints every **FN** (unmatched gold) and **FP** (unmatched pred), same greedy matching as **`eval:pipeline`**. **`evalBoundaryCuts`** also returns **`unmatchedGoldSec`** / **`unmatchedPredSec`** for programmatic use.

---

## Immediate next step (Ran / current gold)

1. **FN list:** Run **`eval:boundary-misses`** on your best predicted JSON vs **`eval/gold/gold-ran-2026-04-10.json`**; inspect times and scrub video at those instants to label *why* the detector missed (merge, weak cue, etc.).
2. **TransNet (baseline done 2026-04-10):** Sweeps in **`eval/runs/2026-04-10-transnet-threshold-sweep.md`** — keep TransNet as an **optional** extra-cut source; do not assume it fixes this gold without per-miss analysis.
3. **Isolate knobs (still useful):** Re-run **ensemble only** with default merge gap to separate **gap** vs **detector** effects.
4. **Stricter alignment (optional):** **`eval:boundary-deltas`** / **`eval:sweep-tol`** at **`--tol 0.25`** to stress-test localization.

Use the **same** gold file and **same** source video timebase for every comparison.

---

## Tuning flow — stages (conceptual)

| Stage | Purpose | CLI / repo today | Target in-app (product) |
|-------|---------|------------------|-------------------------|
| **1. Sample** | Bound CPU/time; stable eval window | `ingestStartSec` / `ingestEndSec` on ingest; `detect:export-cuts --start/--end` | User picks **start/end** or **preset lengths** (e.g. first N min); store **window** on a **tuning session** |
| **2. Human gold** | Ground-truth cut instants on **film timeline** | **`/eval/gold-annotate`**, export JSON; or `eval/gold/*.json` in repo | **`eval_gold_revisions`** via **`POST /api/eval-gold-revisions`** (append-only history); **`/eval/gold-annotate`** still valid |
| **3. Auto predict** | Same detector policy as production | **`npm run detect:export-cuts`** on worker-capable host with **PATH** + env; optional **`npm run detect:refine-fn-windows`** (second pass on FN windows — expensive) | Worker **`POST /api/boundary-detect`** with **`presetId`** → JSON **`cutsSec`** (uses **`detectShotsForIngest` + `boundaryOverrides`**) |
| **4. Score** | F1 + timing bias + miss lists | **`npm run eval:pipeline`**, **`npm run eval:boundary-deltas`**, **`npm run eval:boundary-misses`** (add **`--markdown --out eval/runs/....md`** to log FN/FP) | **`POST /api/boundary-eval-runs`** (persists **`boundary_eval_runs`**) + same **`evalBoundaryCuts`** math |
| **5. Adjust** | One knob per iteration | Env: **`METROVISION_BOUNDARY_MERGE_GAP_SEC`**, **`METROVISION_BOUNDARY_DETECTOR`**, **`extraBoundaryCuts`**, TransNet file; **`detect-export-cuts --fusion-policy`** (`merge_flat` \| `auxiliary_near_primary` \| `pairwise_min_sources`) when merging extras; refinement CLI merges extra cuts with same epsilon | **Global** **`boundary_cut_presets`** rows; duplicate/edit JSON in workspace or API |
| **6. Log** | Audit trail for product + support | **`eval/runs/ledger.jsonl`**, **`eval/runs/*.json`**, **`2026-04-10-ran-boundary-timing.md`** | **`boundary_eval_runs`** + gold revision chain; CLI ledger still optional |

---

## What to log each tuning iteration (schema sketch)

For **productization**, each run should record (minimum):

- **`filmId`** (or draft ingest id before film row exists)
- **`window`**: `{ startSec, endSec }` (film-absolute)
- **`goldArtifactId`** / **`predArtifactId`** (or inline version hashes)
- **`toleranceSec`** (e.g. 0.5)
- **Metrics:** `precision`, `recall`, `f1`, `tp`, `fp`, `fn`
- **Timing (matched only):** `meanAbsDeltaSec`, `medianAbsDeltaSec`, `meanSignedDeltaSec` (optional)
- **Provenance:** `boundaryLabel`, `mergeGapSec`, `boundaryDetectorEnv`, optional `extraCutsSource`
- **`runLabel`** / **`runId`** (user-readable, e.g. `ran-ensemble-gap022`)
- **`createdAt`**

**Existing building blocks:** `eval_artifacts` (**`kind`**, **`filmId`**, **`sessionId`**, **`label`**, **`payload`** JSON) — can store gold/predicted **`cutsSec`** payloads today; extend with **`kind=tuning_summary`** or a dedicated table when you add UI.

---

## Repo map (current)

| Piece | Location |
|-------|----------|
| Human cuts UI | **`/eval/gold-annotate`** — `src/app/(site)/eval/gold-annotate/page.tsx` |
| Artifact API | **`/api/eval/artifacts`** — `src/app/api/eval/artifacts/**` |
| DB | **`eval_artifacts`**, **`boundary_cut_presets`**, **`eval_gold_revisions`**, **`boundary_eval_runs`** — `src/db/schema.ts` |
| Detect-only (no DB) | **`npm run detect:export-cuts`** — `scripts/detect-export-cuts.ts` (**`--fusion-policy`**, **`--extra-cuts`**) |
| Fusion policies (primary + auxiliary cuts) | **`src/lib/boundary-fusion.ts`** — `fuseBoundaryCutStreams`; wired in **`detectShotsForIngest`** |
| FN-window refinement | **`npm run detect:refine-fn-windows`** — `scripts/detect-refine-fn-windows.ts` (`--gold`, `--pred`, `--pad`, **`--max-windows`**) |
| F1 | **`npm run eval:pipeline`** — `scripts/eval-pipeline.ts` |
| Matched-pair timing | **`npm run eval:boundary-deltas`** — `scripts/eval-boundary-deltas.ts` |
| FN / FP cut lists | **`npm run eval:boundary-misses`** — `scripts/eval-boundary-misses.ts` (`--json`, **`--markdown`**, **`--out`**) |
| Eval JSON shape | **`src/lib/eval-cut-json.ts`** — `extractCutsSecFromEvalJson` (shared by eval CLIs) |
| Operator ledger | **`eval/runs/ledger.jsonl`**, **`eval/runs/*.json`**, **`eval/runs/*-boundary-timing.md`** |

---

## Operator quickstart (in-app + worker)

1. **Migrate:** apply **`drizzle/0009_boundary_cut_tuning.sql`** (or `pnpm db:push`). Run **`pnpm db:seed`** to insert default preset **`cemented-ran-2026-04-11`**.
2. **Presets:** open **`/tuning/workspace`** — list/duplicate global presets; expand JSON to verify `boundaryDetector` + `mergeGapSec`.
3. **Gold:** add revisions via **`POST /api/eval-gold-revisions`** or continue using **`/eval/gold-annotate`**; history per film at **`GET /api/eval-gold-revisions?filmId=`**.
4. **Predict:** on the worker host, **`POST /api/boundary-detect`** with `{ "videoPath": "/local/path.mp4", "presetId": "<uuid>" }` (optional `startSec`/`endSec`). Copy `cutsSec` from JSON.
5. **Score:** **`POST /api/boundary-eval-runs`** with `goldRevisionId`, `presetId`, `predictedCutsSec`, `toleranceSec` — persists P/R/F1 + miss lists. List runs: **`GET /api/boundary-eval-runs?filmId=`**.
6. **Ingest:** **`PATCH /api/films/{id}/boundary-cut-preset`** with `{ "boundaryCutPresetId": "<uuid>" }` so worker ingest uses that preset when the request does not pass `boundaryCutPresetId`. Set **`NEXT_PUBLIC_WORKER_URL`** so the tuning UI can call **`/api/boundary-detect`**.

## Product principles (short)

- **Opt-in per film:** tuning is **optional**; default ingest uses workspace/global preset.
- **Same clock:** gold **`cutsSec`** and auto cuts must share **one timebase** (film-absolute from file t=0 or explicit **`timeOffsetSec`**).
- **One knob per run** when learning; log everything so support can replay.
- **Sample first:** users tune on a **clip**; **promote** winning preset to **full-film ingest** without forcing full-length gold.

---

## Changelog

| Date | Note |
|------|------|
| 2026-04-10 | Initial tuning-flow doc; Ran eval path documented in **`eval/runs/`** and **`eval/gold/README.md`**. |
| 2026-04-10 | Decision point (TransNet sweep vs ensemble); Phases 7–11 on roadmap; **`eval:boundary-misses`** + **`unmatchedGoldSec`/`unmatchedPredSec`** on **`evalBoundaryCuts`**. |
| 2026-04-10 | Phase 7–8 execution: **`eval-cut-json`**, **`eval:boundary-misses --markdown/--out`**, **`detect:refine-fn-windows`**, **`mergeInteriorCutSec`**. |
| 2026-04-11 | **Phase 10** planned: global presets, gold revision history, eval runs, worker preset path — `.planning/phases/10-shot-boundary-cut-eval-and-tuning-product/`. |
