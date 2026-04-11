# Boundary tuning roadmap + finishing Ran (reference)

**Created:** 2026-04-10  
**Purpose:** Single reference for (1) the **product direction** for sample-driven boundary tuning and reuse of past tuning sessions, and (2) **ordered work to close Ran** as the first fully tuned benchmark. Update this file when Ran is “done” or when Phase 10/11 scope changes.

**Living metrics + baselines:** [`eval/runs/STATUS.md`](../eval/runs/STATUS.md) — **CEMENTED** production row (2026-04-11).  
**In-app:** route **`/tuning`** (`src/app/(site)/tuning/page.tsx`).  
**Operator workflow:** [`docs/tuning-flow.md`](../docs/tuning-flow.md)  
**Roadmap index:** [`ROADMAP.md`](ROADMAP.md)

---

## Product direction (future)

Use learnings from boundary eval/tuning to support **automation** that can:

1. **Self-tune** from a **sample** (~15 min of cuts / timeline) on a given title — propose or iterate detector + merge + fusion settings within safe bounds.
2. **Reuse signal** from **other tuning sessions** (retrieval over structured session records, then optional search over a small discrete knob grid).

**Realistic V1 “learning”:** RAG + priors over past sessions (not implicit gradient learning). **V2:** bandit / grid search with warm-start from similar films. **V3:** stronger transfer requires **multi-film gold** (Phase 11) and rich **session features**.

---

## What already exists (foundation)

| Piece | Location / notes |
|-------|------------------|
| Ran hand gold | `eval/gold/gold-ran-2026-04-10.json` — 71 interior cuts, last ~763 s |
| Length-matched baseline pred | `eval/predicted/ran1243-ensemble-gap022-20260410.json` — F1 **0.80** @ tol **0.5** (see STATUS) |
| FN/FP tooling | Phase 7 — `pnpm eval:boundary-misses` |
| FN-window second pass | Phase 8 — `pnpm detect:refine-fn-windows` (full-length source + duration clip fix) |
| Fusion policies | Phase 9 — `src/lib/boundary-fusion.ts`, `detect-export-cuts --fusion-policy` |
| Roadmap slots | Phase 10 HITL, Phase 11 eval corpus |

---

## Roadmap mapping (enabling future automation)

| Track | Role |
|-------|------|
| **Phase 10 — Cut eval + tuning product** | Global presets, gold **revision history**, eval runs (F1 + misses), worker detect with preset; UI expands `/tuning`; classification out of scope (see `.planning/phases/10-shot-boundary-cut-eval-and-tuning-product/`). |
| **Phase 11 — Eval corpus** | Second+ gold files + calibration so settings aren’t overfit to Ran; retrieval “similar title” becomes meaningful. |
| **Future (suggested)** | **Session store + tooling** — normalized `tuning_session` (or `eval_artifacts` extensions), CLI/API hooks (detect-only, eval, misses, capped sweeps), **policy** (stop conditions, cost caps), UI “propose → apply.” Not yet a numbered phase; add after 11 when ready. |

---

## “Ran tuning complete” — definition of done

Ran is **finished** when all of the following are true:

1. **Reference media** is fixed and documented (path or stable object key), **duration ≥ last gold cut** (~764 s), same timebase as gold.
2. **Best-known predicted JSON** is in repo with **recorded env** (`METROVISION_BOUNDARY_DETECTOR`, `METROVISION_BOUNDARY_MERGE_GAP_SEC`, `fusionPolicy`, optional extras).
3. **Miss hygiene:** `eval:boundary-misses` exported to `eval/runs/` with human-readable notes on **systematic** FN/FP patterns (optional but strongly recommended for future feature engineering).
4. **Optional grid:** small sweep (e.g. merge gap 0.20 / 0.22 / 0.25) **or** explicit statement “0.22 chosen; grid deferred” to avoid a single lucky point.
5. **Refine experiment on full-length source:** `detect:refine-fn-windows` run on length-matched file with documented outcome (helped / hurt / neutral).
6. **Tuning profile artifact** — one JSON (or `eval_artifacts` row) summarizing: window, knobs, metrics, paths to gold/pred, `tol`, date.

---

## Next steps to finish Ran (execute in order)

1. **Confirm canonical video** — Same clock as gold; **≥ ~764 s**. **Repo reference:** `s3://metrovision-superai/films/ran-1985/source/Ran1243.mov` (see **`eval/runs/STATUS.md`** for object URL + presign policy). Document in `STATUS` if the key changes.
2. **Freeze baseline v1** — Treat `eval/predicted/ran1243-ensemble-gap022-20260410.json` as current best unless a sweep beats it; if replaced, update STATUS + commit new pred JSON.
3. **Export miss lists** —  
   `pnpm eval:boundary-misses -- eval/gold/gold-ran-2026-04-10.json eval/predicted/ran1243-ensemble-gap022-20260410.json --tol 0.5 --markdown --out eval/runs/ran1243-misses.md`  
   Then add a short **notes** subsection (pattern tags: merge swallow, flash, fade, etc.).
4. **Merge-gap micro-sweep (optional but “complete”)** — Re-run `detect:export-cuts` on the same file for **0.20** and **0.25** (keep ensemble); table P/R/F1 in `eval/runs/` or append to this doc.
5. **Fusion experiment (if extras exist)** — If TransNet (or other) cut JSON exists for the **same** source window, run `--extra-cuts` with `auxiliary_near_primary` or `pairwise_min_sources`; compare to `merge_flat`; log outcome (even if “no gain”).
6. **Refine on full-length clip** —  
   `pnpm detect:refine-fn-windows -- <Ran1243 path> --gold eval/gold/gold-ran-2026-04-10.json --pred eval/predicted/ran1243-ensemble-gap022-20260410.json --pad 2 --max-windows N --start 0 --end 780 --out eval/predicted/ran1243-refine.json`  
   Score with `eval:pipeline`; if better, promote; if worse, document why.
7. **Write tuning profile JSON** — e.g. `eval/runs/ran-tuning-profile-v1.json` with fields in “definition of done” §6; link from STATUS.
8. **Check the box** — Add a line under this file: `**Ran tuning status:** COMPLETE (YYYY-MM-DD)` with pointer to profile + best pred path.

---

## Risks / constraints (for later automation design)

- Tuning on a **window** must not be silently assumed to hold for **full feature** without a policy (re-detect full film = separate job + cost).
- Presigned URLs carry **credentials** — never commit; use local paths or server-side keys for automation.
- Automation needs **timeouts**, **max parallel detects**, and **versioned gold** (no overwrite without history).
