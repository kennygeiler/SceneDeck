export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  getBoundaryCutPresetById,
  getEvalGoldRevisionById,
  insertBoundaryEvalRun,
  listBoundaryEvalRunsForFilm,
} from "@/db/boundary-tuning-queries";
import { evalBoundaryCuts } from "@/lib/boundary-eval";
import { extractCutsSecFromEvalJson } from "@/lib/eval-cut-json";

export async function GET(request: NextRequest) {
  const filmId = request.nextUrl.searchParams.get("filmId");
  if (!filmId?.trim()) {
    return Response.json({ error: "filmId query required" }, { status: 400 });
  }
  const runs = await listBoundaryEvalRunsForFilm(filmId.trim());
  return Response.json({ runs });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const goldRevisionId =
      typeof body.goldRevisionId === "string" ? body.goldRevisionId.trim() : "";
    if (!goldRevisionId) {
      return Response.json({ error: "goldRevisionId is required" }, { status: 400 });
    }

    const goldRev = await getEvalGoldRevisionById(goldRevisionId);
    if (!goldRev) {
      return Response.json({ error: "Gold revision not found" }, { status: 404 });
    }

    const predRaw = body.predictedCutsSec;
    if (!Array.isArray(predRaw)) {
      return Response.json(
        { error: "predictedCutsSec must be a number[] (run worker boundary-detect first)" },
        { status: 400 },
      );
    }
    const predCuts = predRaw
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x >= 0);

    const tol =
      body.toleranceSec === undefined || body.toleranceSec === null
        ? 0.5
        : Number(body.toleranceSec);
    if (!Number.isFinite(tol) || tol < 0) {
      return Response.json({ error: "Invalid toleranceSec" }, { status: 400 });
    }

    const presetId: string | null =
      typeof body.presetId === "string" && body.presetId.trim()
        ? body.presetId.trim()
        : null;
    if (presetId) {
      const p = await getBoundaryCutPresetById(presetId);
      if (!p) return Response.json({ error: "Preset not found" }, { status: 404 });
    }

    const goldCuts = extractCutsSecFromEvalJson(goldRev.payload);
    const result = evalBoundaryCuts(goldCuts, predCuts, tol);

    const metrics = {
      precision: result.precision,
      recall: result.recall,
      f1: result.f1,
      tp: result.truePositives,
      fp: result.falsePositives,
      fn: result.falseNegatives,
    };

    const run = await insertBoundaryEvalRun({
      filmId: goldRev.filmId,
      goldRevisionId,
      presetId,
      predictedPayload: { cutsSec: predCuts },
      toleranceSec: tol,
      metrics,
      unmatchedGoldSec: result.unmatchedGoldSec,
      unmatchedPredSec: result.unmatchedPredSec,
      provenance: {
        matchedPairs: result.matchedPairs,
        boundaryLabel: typeof body.boundaryLabel === "string" ? body.boundaryLabel : null,
      },
    });

    if (!run) {
      return Response.json({ error: "Insert failed" }, { status: 500 });
    }
    return Response.json({ run, eval: result }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
