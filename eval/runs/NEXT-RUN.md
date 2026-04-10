# Next boundary eval — ready to run

**Done (2026-04-10):** PyScene ensemble + `MERGE_GAP_SEC=0.22` — see `2026-04-10-ran-ranshort-ensemble-gap022.json` and `eval/predicted/ran-detect-ensemble-gap022.json` (**F1 ~0.71** vs **~0.52** FFmpeg baseline).

**Original baseline:** `2026-04-10-ran-ranshort-s3-baseline.json`.

## Step 0: `PATH` for `pip install --user`

Node spawns `scenedetect` using **`PATH`**. If you used `python3 -m pip install --user scenedetect[opencv]`, ensure **`~/.local/bin`** is on `PATH` before `npm run detect:export-cuts`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Step 1 (recommended): PySceneDetect on PATH

The baseline run resolved to **`ffmpeg_scene`**, not dual PyScene. Install the CLI so results match production intent:

```bash
python3 -m pip install --user 'scenedetect[opencv]'
export PATH="$HOME/.local/bin:$PATH"
scenedetect version
```

Optional: set **`METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene`** for adaptive+content+NMS (same as tuned worker).

Then re-baseline (new `runId`, new `--out`):

```bash
cd /home/paperspace/MetroVision
METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene \
  npm run detect:export-cuts -- /home/paperspace/videos/ranshort.mov \
  --start 0 --end 780 \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-detect-pyscene-ensemble.json \
  --ledger --run-id ran-ranshort-pyscene-ensemble --film-title "Ran"
```

Check stderr / JSON: **`boundary.boundaryLabel`** should contain **`pyscenedetect`**, not **`ffmpeg_scene`**.

## Step 2: Tighter merge gap (targets recall / FN)

**One knob vs baseline:** lower merge gap, same video/gold/tol.

```bash
cd /home/paperspace/MetroVision
METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22 \
  npm run detect:export-cuts -- /home/paperspace/videos/ranshort.mov \
  --start 0 --end 780 \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-detect-gap022.json \
  --ledger --run-id ran-ranshort-merge-gap-022 --film-title "Ran"
```

If PyScene is installed, combine both:

```bash
METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene \
METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22 \
  npm run detect:export-cuts -- /home/paperspace/videos/ranshort.mov \
  --start 0 --end 780 \
  --gold eval/gold/gold-ran-2026-04-10.json --tol 0.5 \
  --out eval/predicted/ran-detect-ensemble-gap022.json \
  --ledger --run-id ran-ranshort-ensemble-gap022 --film-title "Ran"
```

**You can run Step 1 or Step 2 as soon as this commit is pulled** — no code changes required.

---

## After ensemble + gap 0.22 (optional)

- **A/B:** Re-run with default merge gap (`unset METROVISION_BOUNDARY_MERGE_GAP_SEC`) but ensemble only, to see how much recall came from **0.22** vs **PyScene**.
- **More recall:** TransNet cuts via `--extra-cuts` or `METROVISION_EXTRA_BOUNDARY_CUTS_JSON` (still **26** FN at tol 0.5).
- **Tune gap:** Try `0.18` or `0.25` if FP/FN tradeoff shifts.
