# Boundary eval — current status (living notes)

**Purpose:** Single place for **where we are** on shot-boundary evaluation: canonical gold/pred files, latest numbers, decisions, and **benchmark targets**. Update this when a run changes the baseline or when strategy shifts.

**Deeper narrative:** [`docs/tuning-flow.md`](../docs/tuning-flow.md) · **Env / workflow:** [`docs/pipeline-analysis.md`](../docs/pipeline-analysis.md) §3 · **Finish Ran + tuning-agent roadmap:** [`.planning/tuning-agent-and-ran-completion.md`](../../.planning/tuning-agent-and-ran-completion.md).

---

## Canonical gold (Ran, hand labels)

| Field | Value |
|-------|--------|
| **Gold JSON** | [`eval/gold/gold-ran-2026-04-10.json`](../gold/gold-ran-2026-04-10.json) — dense **hard-cut** instants (interior `cutsSec`; see [`eval/gold/README.md`](../gold/README.md)) |
| **Interior gold cuts** | **71** |
| **Last gold instant** | **763.222 s** — source file must span **≥ ~764 s** for a fair full-gold eval |
| **Eval window (CLI)** | **`--start 0 --end 780`** (or higher if the last shot extends past 780 s) |
| **Match tolerance** | **`0.5 s`** (`evalBoundaryCuts` greedy one-to-one — same as `pnpm eval:pipeline` / `detect-export-cuts --gold`) |
| **Primary metric** | **F1** at fixed tol; report **P/R/TP/FP/FN** together |

---

## Primary baseline — length-matched source (authoritative)

**Requirement:** Video **duration must cover the gold timeline** (~764 s). A short transcode (e.g. ~443 s “ranshort”) leaves **~26 gold cuts with no possible match** in the last third of the timeline — metrics look like a **recall crash** even when detector settings are unchanged.

**Canonical media (S3, updated long clip aligned to gold):**

| Field | Value |
|-------|--------|
| **Bucket** | `metrovision-superai` |
| **Region** | `us-east-2` |
| **Key** | `films/ran-1985/source/Ran1243.mov` |
| **S3 URI** | `s3://metrovision-superai/films/ran-1985/source/Ran1243.mov` |
| **Object URL (identification; access usually requires IAM or presign)** | `https://metrovision-superai.s3.us-east-2.amazonaws.com/films/ran-1985/source/Ran1243.mov` |

**Presigned URLs:** Use the AWS Console, SDK, or CLI to generate a **fresh** download URL when running `detect-export-cuts` on a remote host. **Do not commit presigned URLs** to the repo (they contain temporary security tokens and expire).

**Config (detect / ingest-aligned):**

- `METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene`
- `METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22`
- PyScene CLI on `PATH` (avoid `ffmpeg_scene+ensemble_fallback` for apples-to-apples)
- **`detect-export-cuts`:** `--fusion-policy merge_flat` (default; no extra cut stream for this run)

**Predicted JSON in repo:**

- [`eval/predicted/ran1243-ensemble-gap022-20260410.json`](../predicted/ran1243-ensemble-gap022-20260410.json) — generated from the canonical **`Ran1243.mov`** object above (probed **~763.4 s**), same env as below; `videoPath` in JSON is the machine-local path used at generation (e.g. after `curl` download).

**Numbers @ tol 0.5 s** (gold vs file above):

| Metric | Value |
|--------|------:|
| TP | 58 |
| FP | 16 |
| FN | 13 |
| Precision | **0.784** |
| Recall | **0.817** |
| F1 | **0.800** |
| Interior pred cuts | 74 |
| **`boundaryLabel`** | `pyscenedetect_ensemble_pyscene` |
| **`boundary.fusionPolicy`** | `merge_flat` |

**Interpretation:** Recall and F1 are strong vs full gold; precision is a bit lower than the short-file artifact because the detector proposes **more** interior cuts (74 vs 55). Next tuning is less “fix recall” and more **precision / spurious-cut control** (merge gap, extras fusion, optional refine/HITL).

---

## Legacy / short-source artifact (do not use for full-gold claims)

**Predicted JSON (historical):**

- [`eval/predicted/ran-detect-ensemble-gap022.json`](../predicted/ran-detect-ensemble-gap022.json)
- [`eval/predicted/ran-presigned-local-20260410.json`](../predicted/ran-presigned-local-20260410.json)

These match a **~443 s** source; **gold still lists cuts up to ~763 s**, so **FN are inflated** and **F1 ~0.71 is not comparable** to the length-matched baseline. Keep only as a **regression fixture** (“same short clip + same cuts”) or for CI smoke-style checks, not as the product benchmark.

| Metric @ tol 0.5 s (short source) | Value |
|----------------------------------|------:|
| TP / FP / FN | 45 / 10 / 26 |
| F1 | **~0.714** |

---

## Eval pipeline stack (what runs, in order)

1. **Gold** — `eval/gold/*.json` → `cutsSec` (film-absolute seconds).
2. **Predicted boundaries (detect-only)** — `pnpm detect:export-cuts` → `src/lib/ingest-pipeline.ts` **`detectShotsForIngest`** (same path as worker when configured identically): PyScene **adaptive + content** in parallel if `pyscenedetect_ensemble_pyscene`, **NMS / cluster** with **`METROVISION_BOUNDARY_MERGE_GAP_SEC`**, optional file/env/inline extras merged per **`boundaryFusionPolicy`** (`src/lib/boundary-fusion.ts`). Output: `cutsSec` + `boundary` metadata.
3. **Full-film export (optional)** — `pnpm eval:export-film -- <filmId>` from DB shots (different path; still comparable via `eval:pipeline`).
4. **Scoring** — `pnpm eval:pipeline` → `evalBoundaryCuts` (greedy match, tol).
5. **Diagnostics** — `pnpm eval:boundary-misses` (FN/FP lists, Phase 7); `npm run eval:boundary-deltas` (|pred−gt| on TPs); `npm run eval:sweep-transnet` (grid, optional); `pnpm eval:smoke` (CI).

---

## What has been tuned / built (recent track)

| Area | What we did |
|------|-------------|
| **Detector** | Dual PyScene (**ensemble**) vs single / FFmpeg fallback; label in `boundaryLabel`. |
| **Merge** | **`METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22`** tuned for dense hard-cut gold (vs default 0.35). |
| **Extras + fusion (Phase 9)** | `fuseBoundaryCutStreams` + `detect-export-cuts --fusion-policy`; TransNet sweeps did **not** beat ensemble-only on Ran when merged flat — see [`2026-04-10-transnet-threshold-sweep.md`](2026-04-10-transnet-threshold-sweep.md). |
| **FN tooling (Phase 7)** | `eval:boundary-misses`, `unmatchedGoldSec` / `unmatchedPredSec` in `evalBoundaryCuts`. |
| **Local refine (Phase 8)** | `detect:refine-fn-windows` (second pass on FN windows); script fixed for **`probeVideoDurationSec`** import and **clip end capped to probed duration**. On short clip + first N FN windows, refine did **not** improve F1 (added FP). |
| **Source alignment** | Confirmed **Ran1243** (~763 s) matches gold extent; **primary** benchmark updated to that run. |

---

## Improvement targets (refresh)

Track against the **length-matched** row unless you explicitly evaluate on a **trimmed gold** or a **short clip**.

| Tier | F1 @ 0.5 s | Recall @ 0.5 s | Status vs Ran1243 baseline |
|------|------------|----------------|----------------------------|
| **Primary baseline** | **0.80** | **0.82** | Current committed pred |
| **Near-term (historical)** | ≥ 0.75 | ≥ 0.70 | **Met** on length-matched run |
| **Stretch (historical)** | > 0.80 | > 0.75 | F1 at **0.80**; R **0.82** meets stretch recall; next: **push F1 with precision** or **multi-film** |

**Secondary checks:** `eval:boundary-deltas`, `eval:boundary-misses --markdown --out …`

**Regression:** `pnpm eval:smoke` green; avoid dropping length-matched F1 without a documented tradeoff.

---

## Decisions already logged

- **TransNet threshold × merge-gap sweeps** on this clip did **not** beat **ensemble-only @ gap 0.22** when merged naïvely — see [`2026-04-10-transnet-threshold-sweep.md`](2026-04-10-transnet-threshold-sweep.md) and [`docs/tuning-flow.md`](../docs/tuning-flow.md). Revisit with **Phase 9 fusion policies** + extras, not only threshold grid.

---

## Operational notes

- **S3 presigned URLs:** prefer **download to local path** then `detect-export-cuts`; do not commit URLs (credentials in query string).
- **Ledger:** optional `eval/runs/ledger.jsonl` via `detect-export-cuts --ledger`.

---

## Next roadmap slice

- **Phase 10 (HITL):** in-app review for per-film boundary tuning.  
- **Phase 11:** multi-film gold + calibration so Ran is not the only anchor.  
- **Exploration (near term):** `auxiliary_near_primary` / `pairwise_min_sources` with **real** extra cut JSON; tighter **merge gap** or **tol sweep** for precision; **refine-fn-windows** on **length-matched** video with FN caps and cost limits.

**Phase 9 (shipped):** [`../../.planning/phases/09-shot-boundary-fusion-policy-consensus-and-prune-auxiliary-detector-peaks/`](../../.planning/phases/09-shot-boundary-fusion-policy-consensus-and-prune-auxiliary-detector-peaks/).
