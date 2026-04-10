# Per-film boundary tuning flow (CLI today → in-app product)

This document **logs the intended tuning workflow** so operators (and future app UX) can repeat it: **sample window → human cuts → auto detect → metrics → adjust → re-run**. It complements **`eval/runs/README.md`** (append-only ledger) and **`eval/runs/*.json`** (structured run snapshots).

---

## Immediate next step (Ran / current gold)

1. **Recall first:** Add a second signal for missed hard cuts — e.g. **TransNet** (or similar) → **`extraBoundaryCuts`** / **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`**, fused with **PyScene ensemble** + your chosen **`METROVISION_BOUNDARY_MERGE_GAP_SEC`**. Re-run **`npm run detect:export-cuts`** and compare F1 / FN.
2. **Isolate knobs:** Optionally re-run **ensemble only** with default merge gap (no `0.22`) to see how much **gap** alone contributed vs **PyScene vs FFmpeg**.
3. **Stricter alignment (optional):** Run **`npm run eval:boundary-deltas`** at **`--tol 0.25`** (or **`pnpm eval:sweep-tol`**) to see how fragile F1 is when you demand tighter gold–pred agreement.

Use the **same** gold file and **same** source video timebase for every comparison.

---

## Tuning flow — stages (conceptual)

| Stage | Purpose | CLI / repo today | Target in-app (product) |
|-------|---------|------------------|-------------------------|
| **1. Sample** | Bound CPU/time; stable eval window | `ingestStartSec` / `ingestEndSec` on ingest; `detect:export-cuts --start/--end` | User picks **start/end** or **preset lengths** (e.g. first N min); store **window** on a **tuning session** |
| **2. Human gold** | Ground-truth cut instants on **film timeline** | **`/eval/gold-annotate`**, export JSON; or `eval/gold/*.json` in repo | Same UI path; persist as **`eval_artifacts`** (`kind=gold`) linked to **`filmId`** + **sessionId** |
| **3. Auto predict** | Same detector policy as production | **`npm run detect:export-cuts`** on worker-capable host with **PATH** + env | **Server job** (worker or app route): run **`detectShotsForIngest`** only; store **`eval_artifacts`** (`kind=predicted`) + **provenance** (`boundaryLabel`, merge gap, detector env) |
| **4. Score** | F1 + timing bias | **`npm run eval:pipeline`**, **`npm run eval:boundary-deltas`** | API or edge function: **`evalBoundaryCuts`** + delta stats; return **P/R/F1**, **tp/fp/fn**, **mean \|pred−gt\|** on matched pairs |
| **5. Adjust** | One knob per iteration | Env: **`METROVISION_BOUNDARY_MERGE_GAP_SEC`**, **`METROVISION_BOUNDARY_DETECTOR`**, **`extraBoundaryCuts`**, TransNet file | **Tuning profile** per film or per user: named presets (e.g. *Dense cuts*, *Default*); **diff** against last run |
| **6. Log** | Audit trail for product + support | **`eval/runs/ledger.jsonl`**, **`eval/runs/*.json`**, **`2026-04-10-ran-boundary-timing.md`** | **`tuning_runs`** table or **`eval_artifacts`** rows + **summary JSON**; UI **history** timeline |

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
| DB | **`eval_artifacts`** — `src/db/schema.ts` |
| Detect-only (no DB) | **`npm run detect:export-cuts`** — `scripts/detect-export-cuts.ts` |
| F1 | **`npm run eval:pipeline`** — `scripts/eval-pipeline.ts` |
| Matched-pair timing | **`npm run eval:boundary-deltas`** — `scripts/eval-boundary-deltas.ts` |
| Operator ledger | **`eval/runs/ledger.jsonl`**, **`eval/runs/*.json`**, **`eval/runs/*-boundary-timing.md`** |

---

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
