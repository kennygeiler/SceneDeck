import { describe, expect, it } from "vitest";

import { evalBoundaryCuts, normalizeCutList } from "../boundary-eval";

describe("normalizeCutList", () => {
  it("dedupes close times", () => {
    expect(normalizeCutList([1.0, 1.02, 5.0])).toEqual([1.0, 5.0]);
  });
});

describe("evalBoundaryCuts", () => {
  it("matches within tolerance", () => {
    const r = evalBoundaryCuts([10, 20], [10.2, 19.7], 0.5);
    expect(r.truePositives).toBe(2);
    expect(r.falsePositives).toBe(0);
    expect(r.falseNegatives).toBe(0);
    expect(r.f1).toBe(1);
  });

  it("counts misses", () => {
    const r = evalBoundaryCuts([10], [50], 0.5);
    expect(r.truePositives).toBe(0);
    expect(r.falsePositives).toBe(1);
    expect(r.falseNegatives).toBe(1);
    expect(r.f1).toBe(0);
  });
});
