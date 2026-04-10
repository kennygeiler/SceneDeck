/**
 * Second-pass boundary detect on short film-absolute windows around each false-negative gold time;
 * merges new cut instants into baseline predicted cuts (same merge epsilon as ingest).
 *
 * Cost: one detect pass per FN window (use --max-windows to cap). Requires local video + PyScene/env like detect-export-cuts.
 *
 *   pnpm detect:refine-fn-windows -- <videoPath> --gold eval/gold/a.json --pred eval/predicted/b.json [--out refined.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { mergeInteriorCutSec } from "@/lib/boundary-cut-merge";
import { evalBoundaryCuts } from "@/lib/boundary-eval";
import { extractCutsSecFromEvalJson } from "@/lib/eval-cut-json";
import { probeVideoDurationSec } from "@/lib/ffmpeg-bin";
import {
  clipDetectedSplitsToWindow,
  detectShotsForIngest,
  offsetDetectedSplits,
  prepareIngestTimelineAnalysisMedia,
  roundTime,
  type DetectedSplit,
} from "@/lib/ingest-pipeline";

function splitsToCutsSec(splits: DetectedSplit[]): number[] {
  const sorted = [...splits].sort((a, b) => a.start - b.start);
  if (sorted.length < 2) return [];
  return sorted.slice(1).map((s) => roundTime(s.start));
}

function usage(): never {
  console.error(`
Usage:
  pnpm detect:refine-fn-windows -- <videoPath> --gold PATH --pred PATH [options]

Required:
  --gold PATH          eval JSON (number[] or { cutsSec })
  --pred PATH          baseline predicted JSON

Options:
  --pad SEC            half-width of each FN window (default: 2)
  --tol SEC            eval tolerance vs gold (default: 0.5)
  --start SEC          clip gold/pred timeline lower bound (optional)
  --end SEC            clip upper bound (optional; default: probe duration)
  --detector adaptive|content   (default: adaptive)
  --max-windows N      process at most N FN gold times (ascending order)
  --out PATH           write refined JSON (stdout if omitted)
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let goldPath: string | undefined;
  let predPath: string | undefined;
  let outPath: string | undefined;
  let pad = 2;
  let tol = 0.5;
  let startSec: number | undefined;
  let endSec: number | undefined;
  let detector: "content" | "adaptive" = "adaptive";
  let maxWindows: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--gold") goldPath = argv[++i];
    else if (a === "--pred") predPath = argv[++i];
    else if (a === "--out") outPath = argv[++i];
    else if (a === "--pad") pad = Number(argv[++i]);
    else if (a === "--tol") tol = Number(argv[++i]);
    else if (a === "--start") startSec = Number(argv[++i]);
    else if (a === "--end") endSec = Number(argv[++i]);
    else if (a === "--detector") {
      const d = argv[++i];
      if (d !== "content" && d !== "adaptive") usage();
      detector = d;
    } else if (a === "--max-windows") maxWindows = Number(argv[++i]);
    else if (a.startsWith("-")) usage();
    else positional.push(a);
  }

  const videoPath = positional[0];
  if (!videoPath || !goldPath || !predPath) usage();
  if (!Number.isFinite(pad) || pad <= 0) usage();
  if (!Number.isFinite(tol) || tol < 0) usage();
  if (maxWindows !== undefined && (!Number.isFinite(maxWindows) || maxWindows < 1))
    usage();

  return {
    videoPath,
    goldPath,
    predPath,
    outPath,
    pad,
    tol,
    timeline: {
      startSec: startSec,
      endSec: endSec,
    } as { startSec?: number; endSec?: number },
    detector,
    maxWindows,
  };
}

async function detectCutsForFilmWindow(
  resolvedVideo: string,
  window: { startSec: number; endSec: number },
  detector: "content" | "adaptive",
): Promise<number[]> {
  const timeline = { startSec: window.startSec, endSec: window.endSec };
  const timelinePlan = await prepareIngestTimelineAnalysisMedia(
    resolvedVideo,
    timeline,
  );
  try {
    const r = await detectShotsForIngest(timelinePlan.analysisPath, detector, {
      inlineExtraBoundaryCuts: [],
      segmentFilmWindow: timelinePlan.segmentFilmWindow,
    });
    let splits = r.splits;
    if (timelinePlan.splitTimeOffsetSec !== 0) {
      splits = offsetDetectedSplits(splits, timelinePlan.splitTimeOffsetSec);
    }
    splits = clipDetectedSplitsToWindow(splits, timeline);
    return splitsToCutsSec(splits);
  } finally {
    await timelinePlan.disposeSegment?.();
  }
}

function resolveVideoPathOrUrl(videoPath: string): string {
  const t = videoPath.trim();
  return /^https?:\/\//i.test(t) ? t : path.resolve(t);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resolved = resolveVideoPathOrUrl(args.videoPath);
  const goldRaw = JSON.parse(readFileSync(path.resolve(args.goldPath), "utf8")) as unknown;
  const predRaw = JSON.parse(readFileSync(path.resolve(args.predPath), "utf8")) as unknown;
  const goldCuts = extractCutsSecFromEvalJson(goldRaw);
  const baselinePred = extractCutsSecFromEvalJson(predRaw);

  const duration = await probeVideoDurationSec(resolved);
  const maxCue = Math.max(0, ...goldCuts, ...baselinePred);
  const clipStart = args.timeline.startSec ?? 0;
  let clipEnd = args.timeline.endSec;
  if (clipEnd === undefined) {
    clipEnd =
      duration > 0 ? duration : Math.max(maxCue + args.pad + 60, args.pad * 4);
  }
  // Gold windows (e.g. 0–780) may exceed a short source file; ingest rejects empty segments.
  if (duration > 0 && clipEnd > duration) {
    clipEnd = duration;
  }
  if (!(clipEnd > clipStart)) {
    throw new Error(
      `Refine timeline empty after clipping to media duration (${duration}s): start=${clipStart} end=${clipEnd}`,
    );
  }

  const evBase = evalBoundaryCuts(goldCuts, baselinePred, args.tol);
  const fnCenters = [...evBase.unmatchedGoldSec].sort((a, b) => a - b);
  const toProcess =
    args.maxWindows !== undefined
      ? fnCenters.slice(0, args.maxWindows)
      : fnCenters;

  const extras: number[] = [];
  for (const t of toProcess) {
    let w0 = Math.max(0, t - args.pad);
    let w1 = t + args.pad;
    w0 = Math.max(w0, clipStart);
    w1 = Math.min(w1, clipEnd);
    if (!(w1 > w0 + 0.05)) continue;
    const cuts = await detectCutsForFilmWindow(resolved, { startSec: w0, endSec: w1 }, args.detector);
    for (const c of cuts) {
      if (c >= w0 && c <= w1) extras.push(c);
    }
  }

  const mergedCuts = mergeInteriorCutSec(baselinePred, extras);
  const evRefined = evalBoundaryCuts(goldCuts, mergedCuts, args.tol);

  console.error(
    `[detect-refine-fn-windows] baseline: P=${evBase.precision.toFixed(4)} R=${evBase.recall.toFixed(4)} F1=${evBase.f1.toFixed(4)} (FN=${evBase.falseNegatives})`,
  );
  console.error(
    `[detect-refine-fn-windows] refined:  P=${evRefined.precision.toFixed(4)} R=${evRefined.recall.toFixed(4)} F1=${evRefined.f1.toFixed(4)} (FN=${evRefined.falseNegatives})`,
  );

  const payload = {
    schemaVersion: "1.0" as const,
    source: "metrovision_detect_refine_fn_windows",
    generatedAt: new Date().toISOString(),
    videoPath: args.videoPath,
    videoPathResolved: resolved,
    cutsSec: mergedCuts,
    refineMeta: {
      goldPath: path.resolve(args.goldPath),
      basePredPath: path.resolve(args.predPath),
      toleranceSec: args.tol,
      padSec: args.pad,
      fnCentersSec: toProcess,
      fnTotal: fnCenters.length,
      windowsRun: toProcess.length,
      extrasCollected: extras.length,
      baseline: {
        precision: evBase.precision,
        recall: evBase.recall,
        f1: evBase.f1,
        truePositives: evBase.truePositives,
        falsePositives: evBase.falsePositives,
        falseNegatives: evBase.falseNegatives,
      },
      refined: {
        precision: evRefined.precision,
        recall: evRefined.recall,
        f1: evRefined.f1,
        truePositives: evRefined.truePositives,
        falsePositives: evRefined.falsePositives,
        falseNegatives: evRefined.falseNegatives,
      },
      ingestStartSec: args.timeline.startSec,
      ingestEndSec: args.timeline.endSec,
      detector: args.detector,
    },
  };

  const json = `${JSON.stringify(payload, null, 2)}\n`;
  if (args.outPath) {
    const out = path.resolve(args.outPath);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, json, "utf8");
    console.error(`[detect-refine-fn-windows] wrote ${out}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
