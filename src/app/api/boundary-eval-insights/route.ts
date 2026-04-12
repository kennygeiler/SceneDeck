export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  parseBoundaryEvalInsightsPayload,
  type BoundaryEvalInsightsPayload,
} from "@/lib/boundary-eval-insights";
import { rejectIfLlmRouteGated } from "@/lib/llm-route-gate";
import { getGeminiClassifyModel } from "@/lib/pipeline-provenance";
import { acquireToken } from "@/lib/rate-limiter";

export type { BoundaryEvalInsightsPayload };

const SYSTEM = `You help film archivists understand automated shot-boundary detection evaluation.
You receive precision/recall/F1, tolerance in seconds, and samples of missed cuts.
Respond ONLY with valid JSON (no markdown fences) matching this shape:
{
  "summary": string (2-4 short sentences, plain language),
  "whatTheMetricsMean": string (explain precision, recall, F1 for non-experts),
  "suggestedAutomations": [
    {
      "title": string,
      "plainEnglish": string,
      "knobHint": string (e.g. "Try a smaller merge gap", "Enable ensemble detector", "Add TransNet auxiliary cuts")
    }
  ]
}
Suggest 3-6 automations that MetroVision can actually try: merge gap, fusion policy, PyScene adaptive vs content, ensemble detector mode, optional extra boundary cuts — not generic AI advice.`;

export async function POST(request: NextRequest) {
  const gated = rejectIfLlmRouteGated(request);
  if (gated) return gated;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const filmTitle = typeof body.filmTitle === "string" ? body.filmTitle.trim() : "";
    const presetName = typeof body.presetName === "string" ? body.presetName.trim() : "";
    const metrics = body.metrics;
    const tol =
      body.toleranceSec === undefined || body.toleranceSec === null
        ? 0.5
        : Number(body.toleranceSec);
    const unmatchedGold = Array.isArray(body.unmatchedGoldSec) ? body.unmatchedGoldSec : [];
    const unmatchedPred = Array.isArray(body.unmatchedPredSec) ? body.unmatchedPredSec : [];
    const presetConfig =
      body.presetConfigSummary != null ? String(body.presetConfigSummary) : "";

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GOOGLE_API_KEY is not set" }, { status: 500 });
    }

    const userPayload = JSON.stringify(
      {
        filmTitle: filmTitle || "(unknown)",
        presetName: presetName || "(unnamed preset)",
        toleranceSec: Number.isFinite(tol) ? tol : 0.5,
        metrics,
        unmatchedGoldSecSample: unmatchedGold.slice(0, 35),
        unmatchedPredSecSample: unmatchedPred.slice(0, 35),
        presetConfigSummary: presetConfig.slice(0, 2000),
      },
      null,
      2,
    );

    const model = getGeminiClassifyModel();
    await acquireToken();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ parts: [{ text: `Evaluation data:\n${userPayload}` }] }],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );

    if (!response.ok) {
      return Response.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 502 },
      );
    }

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText =
      result.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
    const parsed = parseBoundaryEvalInsightsPayload(rawText);
    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          rawPreview: rawText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    return Response.json({ insights: parsed.insights });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
