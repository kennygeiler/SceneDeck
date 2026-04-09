import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGeminiClassifyParallelism } from "../ingest-pipeline";

describe("resolveGeminiClassifyParallelism", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to at most 4 for high form concurrency", () => {
    vi.unstubAllEnvs();
    expect(resolveGeminiClassifyParallelism(5)).toBe(4);
    expect(resolveGeminiClassifyParallelism(100)).toBe(4);
    expect(resolveGeminiClassifyParallelism(2)).toBe(4);
  });

  it("respects METROVISION_CLASSIFY_CONCURRENCY", () => {
    vi.stubEnv("METROVISION_CLASSIFY_CONCURRENCY", "10");
    expect(resolveGeminiClassifyParallelism(5)).toBe(10);
  });
});
