# Next boundary eval — ready to run

**After:** baseline logged in `2026-04-10-ran-ranshort-s3-baseline.json`.

## Step 1 (recommended): PySceneDetect on PATH

The baseline run resolved to **`ffmpeg_scene`**, not dual PyScene. Install the CLI so results match production intent:

```bash
pip install scenedetect
scenedetect --version
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
