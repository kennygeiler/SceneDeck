# Pipeline eval run log

**Current baseline, targets, and decisions:** **[`STATUS.md`](STATUS.md)** — canonical Ran numbers, **CEMENTED** production profile (2026-04-11), improvement tiers, TransNet decision, presigned-URL note, Phase 9 pointer.

**In-app:** Route **`/tuning`** — canonical boundary profile + operator links + GitHub evidence (`src/app/(site)/tuning/page.tsx`).

Use this folder to **record boundary experiments** without relying on memory or chat history.

**Product tuning narrative (sample → gold → predict → score → adjust):** see **[`docs/tuning-flow.md`](../docs/tuning-flow.md)** — maps this folder + CLI to future **in-app per-film tuning**.

## Quick path (automated ledger line)

From the repo root, after each detect-only experiment:

**Ran gold file (repo convention):** after copying from your machine, use `eval/gold/gold-ran-2026-04-10.json` (see `eval/gold/README.md`).

```bash
pnpm detect:export-cuts -- /path/to/Ran_1985.mp4 --start 0 --end 780 \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/run-label.json \
  --ledger --run-id your-run-id --film-title "Ran"
```

Match `--start` / `--end` to the segment encoded in that gold file (runtime / last shot end in the JSON).

## FN / FP report (markdown)

After you have gold + baseline predicted JSON, write a scrub-friendly miss list into this folder:

```bash
pnpm eval:boundary-misses -- eval/gold/your-gold.json eval/predicted/your-pred.json \
  --tol 0.5 --markdown --out eval/runs/2026-04-10-your-film-misses.md
```

Compare before/after refinement with **`pnpm eval:pipeline`** on the same files.

## FN-window refinement (optional)

Re-detect around missed gold times (one PyScene pass per FN; use **`--max-windows`** while iterating):

```bash
pnpm detect:refine-fn-windows -- /path/to/clip.mp4 \
  --gold eval/gold/your-gold.json \
  --pred eval/predicted/baseline.json \
  --pad 2 --max-windows 10 \
  --start 0 --end 780 \
  --out eval/predicted/your-refined.json
```

Stderr prints baseline vs refined P/R/F1. Then run **`pnpm eval:pipeline -- eval/gold/... eval/predicted/your-refined.json --tol 0.5`**.

- **`ledger.jsonl`**: one JSON object per line (append-only). Safe to `tail` or import into a spreadsheet.
- **`RUN.template.json`**: copy to a dated filename and fill for richer narrative + command history.

## What to capture every time

1. **Identity:** film, segment (time range), `runId` (unique string).
2. **Commands:** exact shell line including env vars (`METROVISION_BOUNDARY_MERGE_GAP_SEC`, `METROVISION_BOUNDARY_DETECTOR`, optional `METROVISION_EXTRA_BOUNDARY_CUTS_JSON`).
3. **Output:** path to `--out` JSON; **`boundary.boundaryLabel`** inside that file (confirms ensemble vs FFmpeg fallback); **`boundary.fusionPolicy`** when using **`detect-export-cuts`** (default **`merge_flat`**).
4. **Metrics:** P/R/F1, tp/fp/fn at a **fixed** `--tol` (e.g. 0.5) for comparability.
5. **Failure mode:** mostly missed cuts (FN), mostly spurious (FP), or mixed.

## Questions to answer after each run (copy into notes)

1. Did **`boundaryLabel`** show **`pyscenedetect_ensemble_pyscene`** (not **`ffmpeg_scene+ensemble_fallback`**)?
2. What **one knob** changed vs the previous run (merge gap, extra cuts file, detector, segment length)?
3. Did **precision** or **recall** move more — does that match what you expected?
4. Any **systematic** errors (e.g. only during fast action, only on fades)?
5. What is the **next single experiment** you want to run?

## Files

| File | Purpose |
|------|---------|
| `ledger.jsonl` | Machine-friendly append log (created by `--ledger`) |
| `RUN.template.json` | Human-friendly structured record; copy per milestone |

## Related

- **`2026-04-10-ran-boundary-timing.md`** — matched-pair **|pred−gt|** stats (mean/median, signed bias, histogram) for Ran gold vs predicted cuts; see `npm run eval:boundary-deltas`.
- **`2026-04-10-ran-transnet-merge-comparison.md`** — TransNet + PyScene ensemble merge vs ensemble-only (F1 comparison).
- **`2026-04-10-transnet-threshold-sweep.md`** — `eval:sweep-transnet` grid (threshold × merge gap) + **distance-to-reliable** notes.
- **`NEXT-RUN.md`** — copy-paste command for the **next** boundary experiment after each logged baseline.
- `pnpm detect:export-cuts` / `npm run detect:export-cuts` — see `scripts/detect-export-cuts.ts`.
- `pnpm detect:refine-fn-windows` — see `scripts/detect-refine-fn-windows.ts`.
- `pnpm eval:pipeline` — compare any two gold/predicted JSON files.
- `docs/pipeline-analysis.md` — env vars and interpretation.
