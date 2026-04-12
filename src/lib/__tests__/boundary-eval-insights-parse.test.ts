import { describe, expect, it } from "vitest";

import {
  parseBoundaryEvalInsightsPayload,
  stripGeminiJsonFence,
} from "@/lib/boundary-eval-insights";

describe("stripGeminiJsonFence", () => {
  it("strips markdown json fence", () => {
    const inner = `{"summary":"a","whatTheMetricsMean":"b","suggestedAutomations":[]}`;
    expect(stripGeminiJsonFence(`\`\`\`json\n${inner}\n\`\`\``)).toBe(inner);
  });
});

describe("parseBoundaryEvalInsightsPayload", () => {
  it("parses valid JSON object", () => {
    const raw = JSON.stringify({
      summary: "S",
      whatTheMetricsMean: "M",
      suggestedAutomations: [
        { title: "T", plainEnglish: "P", knobHint: "K" },
      ],
    });
    const out = parseBoundaryEvalInsightsPayload(raw);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.insights.summary).toBe("S");
      expect(out.insights.suggestedAutomations).toHaveLength(1);
    }
  });

  it("rejects invalid JSON", () => {
    const out = parseBoundaryEvalInsightsPayload("not json");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/non-JSON/i);
  });

  it("rejects missing fields", () => {
    const out = parseBoundaryEvalInsightsPayload(
      JSON.stringify({ summary: "only" }),
    );
    expect(out.ok).toBe(false);
  });
});
