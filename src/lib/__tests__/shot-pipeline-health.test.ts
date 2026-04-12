import { describe, expect, it } from "vitest";

import { countShotsNeedingReliableClassification, shotNeedsReliableClassification } from "@/lib/shot-pipeline-health";
import type { ShotWithDetails } from "@/lib/types";

function minimalShot(partial: Partial<ShotWithDetails["metadata"]>): ShotWithDetails {
  return {
    id: "s1",
    sceneId: null,
    film: { id: "f1", title: "T", director: "D", year: 2000, tmdbId: null, createdAt: null },
    metadata: {
      id: "m1",
      shotId: "s1",
      framing: "centered",
      depth: null,
      blocking: null,
      symmetry: null,
      dominantLines: null,
      lightingDirection: null,
      lightingQuality: null,
      colorTemperature: null,
      foregroundElements: [],
      backgroundElements: [],
      shotSize: null,
      angleVertical: null,
      angleHorizontal: null,
      durationCategory: null,
      classificationSource: "gemini",
      confidence: null,
      reviewStatus: "unreviewed",
      ...partial,
    },
    semantic: null,
    duration: 1,
    sourceFile: null,
    startTc: 0,
    endTc: 1,
    clipMediaAnchorStartTc: null,
    clipTimelinePeers: [],
    videoUrl: null,
    thumbnailUrl: null,
    createdAt: null,
    objects: [],
  };
}

describe("shot-pipeline-health", () => {
  it("flags gemini_fallback", () => {
    expect(shotNeedsReliableClassification(minimalShot({ classificationSource: "gemini_fallback" }))).toBe(true);
  });

  it("flags needs_review", () => {
    expect(shotNeedsReliableClassification(minimalShot({ reviewStatus: "needs_review" }))).toBe(true);
  });

  it("does not flag normal gemini + unreviewed", () => {
    expect(shotNeedsReliableClassification(minimalShot({}))).toBe(false);
  });

  it("countShotsNeedingReliableClassification", () => {
    expect(
      countShotsNeedingReliableClassification([
        minimalShot({}),
        minimalShot({ classificationSource: "gemini_fallback" }),
      ]),
    ).toBe(1);
  });
});
