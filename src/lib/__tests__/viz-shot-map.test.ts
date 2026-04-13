import { describe, expect, it } from "vitest";

import {
  mapRawVisualizationRowToVizShot,
  type RawVisualizationRow,
} from "@/lib/viz-shot-map";

const nullRow = (): RawVisualizationRow => ({
  shotId: "s1",
  filmId: "f1",
  filmTitle: "Test Film",
  director: "Director",
  sceneTitle: null,
  sceneNumber: null,
  framing: null,
  depth: null,
  blocking: null,
  shotSize: null,
  angleVertical: null,
  angleHorizontal: null,
  symmetry: null,
  dominantLines: null,
  lightingDirection: null,
  lightingQuality: null,
  colorTemperature: null,
  durationCat: null,
  foregroundElements: null,
  backgroundElements: null,
  confidence: null,
  reviewStatus: null,
  duration: null,
  description: null,
});

describe("mapRawVisualizationRowToVizShot", () => {
  it("fills taxonomy defaults when metadata joined null", () => {
    const v = mapRawVisualizationRowToVizShot(nullRow(), 3, 0);
    expect(v.framing).toBe("centered");
    expect(v.depth).toBe("medium");
    expect(v.blocking).toBe("single");
    expect(v.shotSize).toBe("medium");
    expect(v.angleVertical).toBe("eye_level");
    expect(v.angleHorizontal).toBe("frontal");
    expect(v.symmetry).toBe("asymmetric");
    expect(v.dominantLines).toBe("none");
    expect(v.lightingDirection).toBe("natural");
    expect(v.lightingQuality).toBe("soft");
    expect(v.colorTemperature).toBe("neutral");
    expect(v.durationCategory).toBe("standard");
    expect(v.foregroundCount).toBe(0);
    expect(v.backgroundCount).toBe(0);
    expect(v.duration).toBe(0);
    expect(v.confidence).toBeNull();
    expect(v.reviewStatus).toBeNull();
    expect(v.shotIndex).toBe(3);
  });

  it("preserves non-null primitives and counts element arrays", () => {
    const v = mapRawVisualizationRowToVizShot(
      {
        ...nullRow(),
        framing: "split",
        depth: "deep_staging",
        foregroundElements: ["a", "b"],
        backgroundElements: ["x"],
        duration: 4.2,
        confidence: 0.91,
        reviewStatus: "human_verified",
      },
      0,
      5,
    );
    expect(v.framing).toBe("split");
    expect(v.depth).toBe("deep_staging");
    expect(v.foregroundCount).toBe(2);
    expect(v.backgroundCount).toBe(1);
    expect(v.duration).toBe(4.2);
    expect(v.confidence).toBe(0.91);
    expect(v.reviewStatus).toBe("human_verified");
    expect(v.objectCount).toBe(5);
  });

  it("treats undefined element arrays as empty", () => {
    const v = mapRawVisualizationRowToVizShot(
      { ...nullRow(), foregroundElements: undefined, backgroundElements: undefined },
      0,
      0,
    );
    expect(v.foregroundCount).toBe(0);
    expect(v.backgroundCount).toBe(0);
  });
});
