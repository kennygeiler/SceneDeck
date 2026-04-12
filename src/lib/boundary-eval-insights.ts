export type BoundaryEvalInsightsPayload = {
  summary: string;
  whatTheMetricsMean: string;
  suggestedAutomations: Array<{
    title: string;
    plainEnglish: string;
    knobHint: string;
  }>;
};

export function stripGeminiJsonFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m?.[1]?.trim() ?? t;
}

export function parseBoundaryEvalInsightsPayload(
  rawText: string,
): { ok: true; insights: BoundaryEvalInsightsPayload } | { ok: false; error: string } {
  const parsedText = stripGeminiJsonFence(rawText);
  let payload: BoundaryEvalInsightsPayload;
  try {
    payload = JSON.parse(parsedText) as BoundaryEvalInsightsPayload;
  } catch {
    return { ok: false, error: "Model returned non-JSON" };
  }

  if (
    typeof payload.summary !== "string" ||
    typeof payload.whatTheMetricsMean !== "string" ||
    !Array.isArray(payload.suggestedAutomations)
  ) {
    return { ok: false, error: "Model JSON missing required fields" };
  }

  return { ok: true, insights: payload };
}
