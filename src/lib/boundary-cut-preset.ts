/**
 * Global boundary-cut preset config (Phase 10). Stored in `boundary_cut_presets.config`.
 * Maps to `detectShotsForIngest` via `presetConfigToDetectOptions` — does not mutate `process.env`.
 */

import type { BoundaryFusionPolicy } from "./boundary-fusion";
import type { DetectShotsForIngestOptions } from "./ingest-pipeline";

export type BoundaryCutPresetConfig = {
  /** Same values as `METROVISION_BOUNDARY_DETECTOR` (e.g. `pyscenedetect_ensemble_pyscene`). */
  boundaryDetector: string;
  mergeGapSec: number;
  fusionPolicy: BoundaryFusionPolicy;
  /** Used when not in ensemble mode. */
  detector?: "content" | "adaptive";
  /** Optional inline extra cuts (film-absolute seconds); file-based env extras still merge when set on worker. */
  extraBoundaryCuts?: number[];
};

const FUSION: BoundaryFusionPolicy[] = [
  "merge_flat",
  "auxiliary_near_primary",
  "pairwise_min_sources",
];

export const DEFAULT_BOUNDARY_CUT_PRESET_SLUG = "cemented-ran-2026-04-11";

/** Matches **CEMENTED** row in `eval/runs/STATUS.md` (ensemble + gap 0.22, no extras). */
export const DEFAULT_BOUNDARY_CUT_PRESET_CONFIG: BoundaryCutPresetConfig = {
  boundaryDetector: "pyscenedetect_ensemble_pyscene",
  mergeGapSec: 0.22,
  fusionPolicy: "merge_flat",
  detector: "adaptive",
};

export function parseBoundaryCutPresetConfig(raw: unknown): BoundaryCutPresetConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Preset config must be an object");
  }
  const o = raw as Record<string, unknown>;
  const boundaryDetector = String(o.boundaryDetector ?? "").trim();
  if (!boundaryDetector) throw new Error("boundaryDetector is required");

  const mergeGapSec = Number(o.mergeGapSec);
  if (!Number.isFinite(mergeGapSec) || mergeGapSec <= 0) {
    throw new Error("mergeGapSec must be a positive number");
  }

  const fp = o.fusionPolicy;
  const fusionPolicy =
    typeof fp === "string" && (FUSION as string[]).includes(fp)
      ? (fp as BoundaryFusionPolicy)
      : "merge_flat";

  let detector: "content" | "adaptive" | undefined;
  if (o.detector === "content" || o.detector === "adaptive") {
    detector = o.detector;
  }

  let extraBoundaryCuts: number[] | undefined;
  if (Array.isArray(o.extraBoundaryCuts)) {
    extraBoundaryCuts = o.extraBoundaryCuts
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x >= 0);
  }

  return {
    boundaryDetector,
    mergeGapSec,
    fusionPolicy,
    detector,
    extraBoundaryCuts:
      extraBoundaryCuts && extraBoundaryCuts.length > 0
        ? extraBoundaryCuts
        : undefined,
  };
}

/**
 * Maps stored preset JSON to `detectShotsForIngest` options.
 * Boundary mode / merge gap are passed as `boundaryOverrides` so detection does not depend on process env alone.
 */
export function presetConfigToDetectOptions(
  config: BoundaryCutPresetConfig,
): Pick<
  DetectShotsForIngestOptions,
  "boundaryFusionPolicy" | "boundaryOverrides" | "inlineExtraBoundaryCuts"
> {
  return {
    boundaryFusionPolicy: config.fusionPolicy,
    boundaryOverrides: {
      boundaryDetector: config.boundaryDetector,
      mergeGapSec: config.mergeGapSec,
    },
    inlineExtraBoundaryCuts: config.extraBoundaryCuts,
  };
}
