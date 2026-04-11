import { access, constants } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

import { db, schema } from "./db.js";
import * as ffmpegBinModule from "../../src/lib/ffmpeg-bin.js";
import * as ingestPipelineModule from "../../src/lib/ingest-pipeline.js";
import * as boundaryEnsembleModule from "../../src/lib/boundary-ensemble.js";
import {
  parseBoundaryCutPresetConfig,
  presetConfigToDetectOptions,
} from "../../src/lib/boundary-cut-preset.js";
import { interiorCutSecFromSplits } from "../../src/lib/boundary-eval.js";

const ffmpegBin = (ffmpegBinModule as { default?: typeof ffmpegBinModule }).default
  ?? ffmpegBinModule;
const ingestPipeline = (ingestPipelineModule as { default?: typeof ingestPipelineModule }).default
  ?? ingestPipelineModule;
const boundaryEnsemble = (boundaryEnsembleModule as { default?: typeof boundaryEnsembleModule })
  .default ?? boundaryEnsembleModule;

const { probeVideoDurationSec } = ffmpegBin;
const {
  detectShotsForIngest,
  parseIngestTimelineFromBody,
  clipDetectedSplitsToWindow,
  prepareIngestTimelineAnalysisMedia,
  offsetDetectedSplits,
} = ingestPipeline;
const {
  parseInlineBoundaryCuts,
  shouldRunPysceneEnsembleForMode,
  mergeBoundaryCutSources,
} = boundaryEnsemble;

async function resolveLocalOrHttpVideo(raw: string): Promise<string> {
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    const p = path.resolve(raw);
    await access(p, constants.R_OK);
    return p;
  }
  throw new Error(
    "boundary-detect: videoUrl must be downloaded by caller or use videoPath for a local file on the worker host",
  );
}

/**
 * POST /api/boundary-detect
 * JSON body: { videoPath, presetId?, presetConfig?, startSec?, endSec?, detector?, extraBoundaryCuts? }
 * Returns predicted interior cut times (film-absolute when timeline used) + boundary label.
 */
export async function boundaryDetectHandler(req: Request, res: Response) {
  try {
    const body = req.body as Record<string, unknown>;
    const videoPathRaw =
      typeof body.videoPath === "string" ? body.videoPath.trim() : "";
    if (!videoPathRaw) {
      res.status(400).json({ error: "videoPath is required (local path on worker)" });
      return;
    }

    let timeline: { startSec?: number; endSec?: number };
    try {
      timeline = parseIngestTimelineFromBody(body as Record<string, unknown>);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid timeline fields";
      res.status(400).json({ error: message });
      return;
    }

    const detector: "content" | "adaptive" =
      body.detector === "content" ? "content" : "adaptive";

    let detectOpts: Parameters<typeof detectShotsForIngest>[2] = {};
    let reqDetector: "content" | "adaptive" = detector;

    const presetId = typeof body.presetId === "string" ? body.presetId.trim() : "";
    const bodyInline = parseInlineBoundaryCuts(body.extraBoundaryCuts) ?? [];

    if (presetId) {
      const [p] = await db
        .select()
        .from(schema.boundaryCutPresets)
        .where(eq(schema.boundaryCutPresets.id, presetId))
        .limit(1);
      if (!p) {
        res.status(404).json({ error: "Preset not found" });
        return;
      }
      const cfg = parseBoundaryCutPresetConfig(p.config);
      const po = presetConfigToDetectOptions(cfg);
      reqDetector = cfg.detector ?? detector;
      detectOpts = {
        ...po,
        inlineExtraBoundaryCuts: mergeBoundaryCutSources(
          po.inlineExtraBoundaryCuts ?? [],
          bodyInline,
        ),
      };
    } else if (body.presetConfig != null) {
      const cfg = parseBoundaryCutPresetConfig(body.presetConfig);
      const po = presetConfigToDetectOptions(cfg);
      reqDetector = cfg.detector ?? detector;
      detectOpts = {
        ...po,
        inlineExtraBoundaryCuts: mergeBoundaryCutSources(
          po.inlineExtraBoundaryCuts ?? [],
          bodyInline,
        ),
      };
    } else {
      detectOpts = {
        inlineExtraBoundaryCuts:
          bodyInline.length > 0 ? bodyInline : undefined,
      };
    }

    const videoPath = await resolveLocalOrHttpVideo(videoPathRaw);
    const timelinePlan = await prepareIngestTimelineAnalysisMedia(videoPath, timeline);

    let rawSplits: Awaited<ReturnType<typeof detectShotsForIngest>>["splits"];
    let detectCtx: Awaited<ReturnType<typeof detectShotsForIngest>>["ctx"];
    try {
      const r = await detectShotsForIngest(
        timelinePlan.analysisPath,
        reqDetector,
        {
          ...detectOpts,
          segmentFilmWindow: timelinePlan.segmentFilmWindow,
        },
      );
      rawSplits = r.splits;
      detectCtx = r.ctx;
    } finally {
      await timelinePlan.disposeSegment?.();
    }

    if (timelinePlan.splitTimeOffsetSec !== 0) {
      rawSplits = offsetDetectedSplits(rawSplits, timelinePlan.splitTimeOffsetSec);
    }
    const splits = clipDetectedSplitsToWindow(rawSplits, timeline);

    const durationSec = await probeVideoDurationSec(videoPath).catch(() => 0);
    const cutsSec = interiorCutSecFromSplits(splits, durationSec);

    const modeForLabel =
      detectOpts.boundaryOverrides?.boundaryDetector ??
      process.env.METROVISION_BOUNDARY_DETECTOR ??
      "pyscenedetect_cli";
    const detectLabel = shouldRunPysceneEnsembleForMode(String(modeForLabel))
      ? "PySceneDetect ensemble"
      : reqDetector === "content"
        ? "Content"
        : "Adaptive";

    res.json({
      cutsSec,
      boundaryLabel: detectCtx.boundaryLabel,
      usedEnsemble: detectCtx.usedEnsemble,
      resolvedDetector: detectCtx.resolvedDetector,
      shotCount: splits.length,
      detectLabel,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[worker] boundary-detect error:", msg);
    res.status(500).json({ error: msg });
  }
}
