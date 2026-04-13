import { describe, expect, it } from "vitest";

import {
  formatConfidencePercent,
  formatLabelProvenance,
  formatReviewStatusLabel,
  humanReviewArchivePercent,
} from "@/lib/archive-trust";

describe("archive-trust", () => {
  it("formats review status for known slugs", () => {
    expect(formatReviewStatusLabel("human_verified")).toBe("Cut accepted");
    expect(formatReviewStatusLabel("needs_review")).toBe("Needs cut review");
    expect(formatReviewStatusLabel(null)).toBe("No cut triage");
  });

  it("formats classification source", () => {
    expect(formatLabelProvenance("manual")).toBe("Hand labels");
    expect(formatLabelProvenance("gemini")).toBe("Model-assist (Gemini)");
  });

  it("formats confidence as percent", () => {
    expect(formatConfidencePercent(0.87)).toBe("87%");
    expect(formatConfidencePercent(87)).toBe("87%");
    expect(formatConfidencePercent(null)).toBe("—");
  });

  it("computes human review percent for archive", () => {
    expect(humanReviewArchivePercent(3, 10)).toBe("30");
    expect(humanReviewArchivePercent(0, 0)).toBe("0");
  });
});
