# Ran1243 boundary sweep — 2026-04-11

**Canonical profile:** **LOCKED** in [`eval/runs/STATUS.md`](STATUS.md) (section **CEMENTED**). This file is supporting evidence for merge-gap invariance on ensemble.

**Source:** `/tmp/Ran1243.mov` (canonical object `s3://metrovision-superai/films/ran-1985/source/Ran1243.mov`, downloaded with presigned URL — do not commit URLs).  
**Gold:** `eval/gold/gold-ran-2026-04-10.json`  
**Tolerance:** `0.5` s  
**Full terminal log:** [`ran1243-merge-gap-sweep-2026-04-11.log`](ran1243-merge-gap-sweep-2026-04-11.log)

Predicted JSON for each run (if kept locally): `eval/predicted/ran1243-sweep-*.json` — naming pattern encodes config.

---

## Phase 1 — merge gap only (`pyscenedetect_ensemble_pyscene`)

| `METROVISION_BOUNDARY_MERGE_GAP_SEC` | P | R | F1 | TP | FP | FN | Interior cuts |
|-------------------------------------:|--:|--:|---:|---:|---:|---:|---------------:|
| 0.18 | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| 0.20 | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| 0.22 | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| 0.24 | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| 0.26 | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |

**Finding:** On this clip + ensemble, **merge gap is a no-op from 0.12 through 0.45** (see Phase 2): interior cut list stayed **74** for every ensemble run. Neighboring PyScene peaks are farther apart than these ε values, so clustering does not change the merged set.

---

## Phase 2 — wider gaps, tight gap, single PyScene

| Config | P | R | F1 | TP | FP | FN | Interior cuts |
|--------|--:|--:|---:|---:|---:|---:|---------------:|
| ensemble, gap **0.35** | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| ensemble, gap **0.45** | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| ensemble, gap **0.12** | 0.784 | 0.817 | **0.800** | 58 | 16 | 13 | 74 |
| **`pyscenedetect_cli`**, **adaptive**, gap 0.22 | 0.791 | 0.746 | 0.768 | 53 | 14 | 18 | 67 |
| **`pyscenedetect_cli`**, **content**, gap 0.22 | 0.794 | 0.761 | 0.777 | 54 | 14 | 17 | 68 |

**Finding:** **Dual PyScene ensemble** beats **single** adaptive/content on this gold. Single modes trade a few FP for **more FN** (lower recall).

---

## Best tuning (for full-film Ran ingest, no major overhaul)

1. **`METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene`**
2. **`METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22`** — keep as the documented default; **no F1 gain** from sweeping gap on this segment, but 0.22 remains a reasonable default vs 0.35 for dense-cut gold elsewhere.
3. **`merge_flat`** unless you have vetted extra cuts and want to try `auxiliary_near_primary` / `pairwise_min_sources`.

**Recommended pred artifact for Ran (unchanged):** `eval/predicted/ran1243-ensemble-gap022-20260410.json` matches this optimum.

---

## What to run on the full film

Use the same env as row “ensemble, any gap 0.18–0.45”:

```bash
export METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene
export METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22
pnpm detect:export-cuts -- /path/to/full/Ran.mov \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-full-ensemble-gap022.json --fusion-policy merge_flat
```

(Omit `--start`/`--end` for full file, or set end to duration.)

**Note:** Full-film metrics vs this **segment** gold are not directly comparable unless the gold window matches the evaluated window.
