import { describe, expect, it } from "vitest";

import { sanitizeClassifiedShot } from "../classification-sanitize";
import type { ClassifiedShot } from "../types";

const base: ClassifiedShot = {
  framing: "centered",
  depth: "medium",
  blocking: "single",
  symmetry: "balanced",
  dominant_lines: "none",
  lighting_direction: "natural",
  lighting_quality: "soft",
  color_temperature: "neutral",
  foreground_elements: [],
  background_elements: [],
  shot_size: "medium",
  angle_vertical: "eye_level",
  angle_horizontal: "frontal",
  duration_cat: "standard",
  description: "x",
  mood: "m",
  lighting: "l",
  subjects: [],
  scene_title: "s",
  scene_description: "",
  location: "loc",
  interior_exterior: "interior",
  time_of_day: "day",
};

describe("sanitizeClassifiedShot", () => {
  it("assigns confidence 1 when all taxonomy keys present (Python parity)", () => {
    const o = sanitizeClassifiedShot(base);
    expect(o.confidence).toBe(1);
  });

  it("lowers confidence when taxonomy keys missing in raw payload", () => {
    const partial = { ...base, depth: "" as unknown as string };
    const o = sanitizeClassifiedShot(partial);
    expect(o.depth).toBe("medium");
    expect(o.confidence).toBe(0.93);
  });

  it("keeps valid framing slug", () => {
    const o = sanitizeClassifiedShot({ ...base, framing: "golden_ratio" });
    expect(o.framing).toBe("golden_ratio");
  });

  it("maps spacey legacy labels to slug or fallback", () => {
    const o = sanitizeClassifiedShot({ ...base, framing: "Tracking Shot" });
    expect(o.framing).toBe("centered");
  });

  it("normalizes underscores from title case", () => {
    const o = sanitizeClassifiedShot({ ...base, framing: "Rule Of Thirds Left" });
    expect(o.framing).toBe("rule_of_thirds_left");
  });
});
