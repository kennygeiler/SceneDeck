# Pipeline analysis — boundaries, environment, and evaluation

This document ties together **shot-boundary detection** configuration (worker / Next ingest), how to **verify** which strategy ran, and how to **measure** boundary quality against human gold (hard cuts).

For deploy and SSE/CORS details, see [production-ingest.md](./production-ingest.md).

---

## 1. Boundary detection environment variables

Set these on the **service that runs ingest** (typically the **Railway worker**). Next.js on Vercel only needs them if you run inline ingest there (not recommended for full features).

| Variable | Default | Purpose |
|----------|---------|---------|
| **`METROVISION_BOUNDARY_DETECTOR`** | `pyscenedetect_cli` | **`pyscenedetect_cli`** — single PySceneDetect run; request body **`detector`** chooses `content` or `adaptive`. **`pyscenedetect_ensemble_pyscene`** or **`pyscenedetect_ensemble`** — run **adaptive + content** in parallel, merge cut endpoints with NMS-style clustering (see §2). |
| **`METROVISION_BOUNDARY_MERGE_GAP_SEC`** | `0.35` | Seconds within which nearby cut times are **merged** into one boundary. **Lower** (e.g. `0.2`–`0.25`) preserves more hard cuts for gold that marks **every** edit; **too low** increases duplicate/spurious cuts. |
| **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`** | *(unset)* | Host path to a JSON **array of numbers** (cut times in **seconds**, film-absolute). Merged with detector output after the same clustering step. Optional if you use request **`extraBoundaryCuts`** instead. |
| **`METROVISION_FFMPEG_SCENE_THRESHOLD`** | `0.32` | When ingest uses FFmpeg **`scene`** filter for cuts: sensitivity of scene-change score. **Lower** → more cuts (higher recall, more noise). |
| **`METROVISION_FFMPEG_SCENE_SAMPLE_FPS`** | `4` (non-Vercel), `2` (Vercel) | Max **analysis** frame rate before `scene` detection. **`0`**, **`full`**, or **`off`** = no fps downsampling (slowest, often **highest recall**). |

### Request body (ingest JSON)

These are **not** environment variables; they travel with `POST /api/ingest-film/stream` (and the worker’s equivalent body).

| Field | Values | Purpose |
|-------|--------|---------|
| **`detector`** | `content` \| `adaptive` | PySceneDetect threshold family when **`METROVISION_BOUNDARY_DETECTOR=pyscenedetect_cli`**. Ignored for path choice when **ensemble** mode is on (ensemble runs **both** internally). |
| **`extraBoundaryCuts`** | `number[]` | Film-absolute cut times in seconds (e.g. from **TransNet** or manual labeling). Merged with file-based **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`** and clustered with **`METROVISION_BOUNDARY_MERGE_GAP_SEC`**. |

### Related (classification, not boundaries)

| Variable | Notes |
|----------|--------|
| **`METROVISION_CLASSIFY_CONCURRENCY`** | Parallel Gemini+FFmpeg classify cap (default effective cap **4** unless set). |
| **`GEMINI_CLASSIFY_MODEL`** / **`GEMINI_ADJUDICATE_MODEL`** | Gemini models for shot classification JSON. |
| **`GOOGLE_API_KEY`** | Required on the worker for classification. |

---

## 2. How to tell if dual PyScene + NMS ran

1. **Environment**  
   `METROVISION_BOUNDARY_DETECTOR` must be **`pyscenedetect_ensemble_pyscene`** or **`pyscenedetect_ensemble`** (case-insensitive in code).

2. **PyScene CLI available**  
   Worker must resolve **`scenedetect`** (or **`SCENEDETECT_PATH`**). Check **`GET {WORKER}/health`** — if scene detect is not available, the code falls back to **FFmpeg scene** + merge, **not** two PyScene passes.

3. **Persisted label (authoritative)**  
   After ingest, the film’s **`ingest_provenance.boundaryDetector`** (and related fields) reflects the resolved strategy, for example:
   - **`pyscenedetect_ensemble_pyscene`** — dual PyScene + merge (possibly with **`+extra_inline`** / **`+extra_file`** if extra cuts were supplied).
   - **`ffmpeg_scene+ensemble_fallback`** — ensemble-style merge, but **PyScene CLI was missing**; not true dual PyScene.

---

## 3. Evaluation workflow (gold vs predicted)

1. **Gold JSON** — Human labels in `eval/gold/<film>.json` with **`cutsSec`** (and optionally per-shot slots). Shape: `eval/gold/template.json`.
2. **Predicted JSON** — Either:
   - After full ingest, export DB shots: `pnpm eval:export-film -- <filmId>` → `eval/predicted/<id>.json`, or
   - **Detect-only (no DB, no Gemini)** — same boundary code as ingest:  
     `pnpm detect:export-cuts -- <videoPath> [--start SEC] [--end SEC] [--gold eval/gold/....json] [--tol 0.5] [--out pred.json] [--ledger --run-id id]`  
     See `scripts/detect-export-cuts.ts` and `eval/runs/README.md` for run logging.
3. **Metrics** —  
   `pnpm eval:pipeline -- eval/gold/<film>.json eval/predicted/<id>.json --tol 0.5`  
   Add **`--slots`** if gold includes composition slots.
4. **Matched-pair timing (not F1)** — mean/median **|pred−gt|**, signed bias, histogram:  
   `npm run eval:boundary-deltas -- --gold eval/gold/....json --pred eval/predicted/....json [--pred p2.json] --tol 0.5 --out eval/runs/report.md`
5. **TransNet threshold × merge-gap grid** (reuses each TransNet JSON per threshold):  
   `npm run eval:sweep-transnet -- --video path.mp4 --gold eval/gold/....json [--start 0] [--end 780] [--thresholds 0.4,0.5,0.6] [--merge-gaps 0.22,0.35] --device cpu --out eval/runs/report.md`  
   Requires **PyScene on PATH** and **TransNet** (`transnetv2-pytorch`).

Tolerance **`--tol`** (seconds): a predicted cut matches a gold cut if their times differ by at most this amount (greedy matching).

---

## 4. First boundary eval — writeup

**Setting:** Gold standard = **every hard cut** (shot-level edits), not scene-level groupings. Comparison used **`toleranceSec: 0.5`**.

**Counts**

| Metric | Value |
|--------|------:|
| True positives | 28 |
| False positives | 9 |
| False negatives | 43 |
| Precision | 0.757 |
| Recall | 0.394 |
| F1 | 0.519 |

**Interpretation**

- **Recall (~0.39)** is the limiting factor: **43** gold cuts were **missed** vs **28** matched. The pipeline is **under-segmenting** relative to dense hard-cut gold (merge gap, single detector mode, missing TransNet/extra cuts, or adaptive/content not recovering all edits).
- **Precision (~0.76)** is moderate: most **predicted** cuts land within **0.5s** of a real cut when they fire; **9** predicted cuts did not match any gold cut in tolerance.
- **Matched-pair deltas** in the low sample were almost all **&lt; 0.5s**, so **localization is good where detection fires**; the gap is **coverage**, not alignment.

**Recommended next experiments (for hard-cut gold)**

1. Lower **`METROVISION_BOUNDARY_MERGE_GAP_SEC`** slightly and re-run the same eval.
2. Set **`METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene`** and confirm **`ingest_provenance.boundaryDetector`** is **`pyscenedetect_ensemble_pyscene`**, not **`ffmpeg_scene+ensemble_fallback`**.
3. Try **`adaptive`** vs **`content`** on **`pyscenedetect_cli`** if not using ensemble.
4. Add **TransNet** (or similar) cuts via **`extraBoundaryCuts`** or **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`** to recover cuts PyScene misses.
5. If using FFmpeg scene fallback, tune **`METROVISION_FFMPEG_SCENE_THRESHOLD`** / **`METROVISION_FFMPEG_SCENE_SAMPLE_FPS`** (full-rate analysis is slower but can improve recall).

**Versioning for future evals**

Record **`ingest_provenance`** (`pipeline_version`, `taxonomy_hash`, **`boundaryDetector`**, Gemini model ids) alongside each predicted JSON so F1 changes trace to config, not noise.

---

## 5. Second boundary eval — run 2 (logged)

**Setting:** Same gold (**every hard cut**) and **`toleranceSec: 0.5`** as run 1, after a configuration pass (e.g. merge gap, ensemble, or detector tweaks — record the exact `ingest_provenance.boundaryDetector` + env in your lab notes).

**Counts**

| Metric | Value |
|--------|------:|
| True positives | 29 |
| False positives | 7 |
| False negatives | 42 |
| Precision | 0.806 |
| Recall | 0.408 |
| F1 | 0.542 |

**Delta vs run 1**

| Metric | Run 1 | Run 2 | Δ |
|--------|------:|------:|---|
| TP | 28 | 29 | +1 |
| FP | 9 | 7 | −2 |
| FN | 43 | 42 | −1 |
| Precision | 0.757 | 0.806 | +0.05 |
| Recall | 0.394 | 0.408 | +0.014 |
| F1 | 0.519 | 0.542 | +0.023 |

**Interpretation**

- **Precision improved more than recall:** two fewer unmatched predictions and one more hit; the system is slightly **cleaner** and **marginally better at finding** hard cuts.
- **Recall remains the story:** ~**41%** of gold cuts are still missed (**42 FN**). Matched pairs in the sample stayed **within ~0.5s**, so **timing** is fine where cuts exist; you still need **more candidate boundaries** or **less merging**, not better alignment tuning alone.

### Recommendation (prioritized for run 3)

1. **Add a second cut source for recall** — Run **TransNet** (or equivalent) offline, merge cut times via **`extraBoundaryCuts`** on ingest (or **`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`** on the worker). This directly targets **false negatives** on dense hard-cut gold without fighting PyScene’s blind spots alone.
2. **If merge gap was only slightly lowered** — Try another step down on **`METROVISION_BOUNDARY_MERGE_GAP_SEC`** (e.g. toward **0.18–0.22**) and re-eval; stop if **FP** climbs faster than **FN** falls.
3. **Confirm dual PyScene is live** — `ingest_provenance.boundaryDetector` should read **`pyscenedetect_ensemble_pyscene`** (not **`ffmpeg_scene+ensemble_fallback`**). If you see the fallback label, fix **`scenedetect`** on the worker before interpreting further boundary tweaks.
4. **If stuck on PyScene-only** — Temporarily set **`METROVISION_FFMPEG_SCENE_SAMPLE_FPS=full`** (or **`0`**) **only** if the worker is on FFmpeg-scene path or hybrid; expect longer detect time; re-measure F1.
5. **Keep a one-line eval ledger** — For each run, append: date, **`boundaryDetector`**, **`METROVISION_BOUNDARY_MERGE_GAP_SEC`**, whether **`extraBoundaryCuts`** were used, and **P/R/F1** so run 3 is comparable to runs 1–2.

---

## 6. Decision point (2026-04-10 — Ran `ranshort`, dense hard-cut gold)

**Context:** On **`ranshort.mov`** with hand gold (**71** interior **`cutsSec`**, **`--end 780`**) and **tolerance 0.5 s**, the best stack observed in lab notes was **PyScene ensemble** with **`METROVISION_BOUNDARY_MERGE_GAP_SEC=0.22`** (**F1 ~0.714**, **recall ~0.63**), with **PyScene on PATH** (avoid **`ffmpeg_scene+ensemble_fallback`**).

**TransNet experiments:** A **threshold × merge-gap sweep** (`npm run eval:sweep-transnet`, thresholds **0.4–0.6**, gaps **0.22 / 0.35**) produced **no configuration that beat ensemble-only** on that clip; merged TransNet peaks did not recover enough **false negatives** to justify more threshold grid search *in isolation*.

**Decision:** Treat **FN analysis** (list every unmatched gold time, scrub video, classify failure mode) as the **next primary loop**, then **local second-pass / alternate cues**, **fusion policy**, and **HITL** — see **`docs/tuning-flow.md`** and **`.planning/ROADMAP.md` Phases 7–11**.

**Tooling:** **`pnpm eval:boundary-misses -- eval/gold/....json eval/predicted/....json [--tol 0.5] [--json]`** — same greedy matching as **`eval:pipeline`**; **`evalBoundaryCuts`** exposes **`unmatchedGoldSec`** and **`unmatchedPredSec`**.

---

## 7. References

- `src/lib/boundary-ensemble.ts` — merge gap, extra cuts file, detector mode string.
- `src/lib/boundary-eval.ts` — greedy match, F1, unmatched gold/pred arrays.
- `src/lib/ingest-pipeline.ts` — `detectShotsForIngest`, `detectShotsEnsemble`, FFmpeg scene helpers.
- `scripts/eval-pipeline.ts` — boundary precision / recall / F1 CLI.
- `scripts/eval-boundary-misses.ts` — FN/FP cut listing CLI.
- `AGENTS.md` — quick eval commands and artifact storage.
