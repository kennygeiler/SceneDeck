import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOUNDARY_CUT_PRESET_CONFIG,
  parseBoundaryCutPresetConfig,
  presetConfigToDetectOptions,
} from "@/lib/boundary-cut-preset";

describe("boundary-cut-preset", () => {
  it("parses valid config", () => {
    const c = parseBoundaryCutPresetConfig({
      boundaryDetector: "pyscenedetect_ensemble_pyscene",
      mergeGapSec: 0.22,
      fusionPolicy: "merge_flat",
    });
    expect(c.boundaryDetector).toBe("pyscenedetect_ensemble_pyscene");
    expect(c.mergeGapSec).toBe(0.22);
    expect(c.fusionPolicy).toBe("merge_flat");
  });

  it("maps to detect options without env", () => {
    const o = presetConfigToDetectOptions(DEFAULT_BOUNDARY_CUT_PRESET_CONFIG);
    expect(o.boundaryOverrides?.boundaryDetector).toBe(
      "pyscenedetect_ensemble_pyscene",
    );
    expect(o.boundaryOverrides?.mergeGapSec).toBe(0.22);
    expect(o.boundaryFusionPolicy).toBe("merge_flat");
  });

  it("rejects invalid merge gap", () => {
    expect(() =>
      parseBoundaryCutPresetConfig({
        boundaryDetector: "x",
        mergeGapSec: 0,
      }),
    ).toThrow();
  });
});
