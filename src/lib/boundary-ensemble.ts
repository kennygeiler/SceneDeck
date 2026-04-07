import { readFileSync } from "node:fs";

/** Phase D: dual PySceneDetect + NMS; optional extra cuts (e.g. TransNet offline JSON). */
export function boundaryModeFromEnv(): string {
  return (
    process.env.METROVISION_BOUNDARY_DETECTOR?.trim() ||
    "pyscenedetect_cli"
  );
}

export function shouldRunPysceneEnsemble(): boolean {
  const m = boundaryModeFromEnv().toLowerCase();
  return (
    m === "pyscenedetect_ensemble" ||
    m === "pyscenedetect_ensemble_pyscene"
  );
}

/** JSON array of cut times in seconds, e.g. `[12.4, 45.02]` — merged after NMS with PyScene cuts. */
export function loadExtraBoundaryCuts(): number[] {
  const p = process.env.METROVISION_EXTRA_BOUNDARY_CUTS_JSON?.trim();
  if (!p) return [];
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x >= 0);
  } catch {
    return [];
  }
}

export function boundaryMergeEpsilonSec(): number {
  const raw = process.env.METROVISION_BOUNDARY_MERGE_GAP_SEC?.trim();
  if (!raw) return 0.35;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0.35;
}

export function clusterCutTimes(times: number[], eps: number): number[] {
  const sorted = [...new Set(times.map((t) => round3(t)))].sort(
    (a, b) => a - b,
  );
  if (sorted.length === 0) return [];

  const merged: number[] = [];
  let start = sorted[0]!;
  let sum = sorted[0]!;
  let count = 1;

  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (t - start <= eps) {
      sum += t;
      count++;
    } else {
      merged.push(round3(sum / count));
      start = t;
      sum = t;
      count = 1;
    }
  }
  merged.push(round3(sum / count));
  return merged;
}

function round3(t: number): number {
  return Math.round(t * 1000) / 1000;
}
