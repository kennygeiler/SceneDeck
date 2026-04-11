import { spawn } from "node:child_process";
import { access, constants, mkdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  envWithFfmpegBinariesOnPath,
  FFMPEG_SPAWN_ENOENT_HINT,
  getFfmpegPath,
  probeVideoDurationSec,
} from "./ffmpeg-bin";
import { uploadToS3, buildS3Key } from "./s3";
import { acquireToken } from "./rate-limiter";
import {
  boundaryExtraTag,
  boundaryMergeEpsilonSec,
  boundaryModeFromEnv,
  clusterCutTimes,
  loadExtraBoundaryCuts,
  mergeBoundaryCutSources,
  shouldRunPysceneEnsembleForMode,
} from "./boundary-ensemble";
import {
  fuseBoundaryCutStreams,
  type BoundaryFusionPolicy,
} from "./boundary-fusion";
import { extractFirstJsonObject } from "./gemini-json-extract";
import {
  getGeminiAdjudicateModel,
  getGeminiClassifyModel,
} from "./pipeline-provenance";

/** Budget for `[classify] …` diagnostics per ingest batch (call `beginClassificationDiagBatch` once before classifying). */
let classificationParseDiagRemaining = 0;

/** Call once per film ingest before parallel `classifyShot` work so parse-failure logs are capped per run, not per shot. */
export function beginClassificationDiagBatch(): void {
  classificationParseDiagRemaining = 12;
}

function logClassificationParseFailure(message: string): void {
  if (classificationParseDiagRemaining <= 0) return;
  classificationParseDiagRemaining -= 1;
  console.warn(`[classify] ${message}`);
}

function summarizeGeminiClassificationFailure(result: unknown): string {
  if (!result || typeof result !== "object") return "response_not_object";
  const r = result as {
    promptFeedback?: { blockReason?: string };
    candidates?: unknown[];
  };
  if (r.promptFeedback?.blockReason) {
    return `prompt_blocked:${r.promptFeedback.blockReason}`;
  }
  if (!r.candidates?.length) return "no_candidates";
  const c0 = r.candidates[0] as {
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  };
  const fr = c0.finishReason ?? "(unset)";
  let text = "";
  for (const p of c0.content?.parts ?? []) {
    if (p?.text) text += p.text;
  }
  const preview = text.trim().replace(/\s+/g, " ").slice(0, 240);
  return `finish=${fr} textLen=${text.length} preview=${preview || "(empty)"}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DetectedSplit = {
  start: number;
  end: number;
  index: number;
};

import { sanitizeClassifiedShot } from "./classification-sanitize";
import type { ClassifiedShot } from "./types";
export type { ClassifiedShot } from "./types";

export type ProgressCallback = (event: ProgressEvent) => void;

export type ProgressEvent =
  | { type: "step"; step: string; status: "active" | "complete"; message?: string; duration?: number }
  | { type: "init"; totalShots: number; concurrency: number }
  | { type: "shot"; step: string; index: number; total: number; worker: number; status: "start" | "complete"; framing?: string; sceneTitle?: string; duration?: number }
  | { type: "complete"; filmId: string; filmTitle: string; shotCount: number; sceneCount: number }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sanitize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function roundTime(t: number): number {
  return Math.round(t * 1000) / 1000;
}

/** Optional ingest window in seconds (empty = full file). Used by UI + ingest APIs. */
export function parseIngestTimelineFromBody(body: Record<string, unknown>): {
  startSec?: number;
  endSec?: number;
} {
  const asOptNumber = (key: string): number | undefined => {
    const v = body[key];
    if (v === undefined || v === null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    if (!Number.isFinite(n)) throw new Error(`${key} must be a finite number`);
    return n;
  };
  let startSec = asOptNumber("ingestStartSec");
  let endSec = asOptNumber("ingestEndSec");
  // Treat 0 like “omit” on the UI; APIs may also send 0 to mean full extent.
  if (startSec === 0) startSec = undefined;
  if (endSec === 0) endSec = undefined;
  if (startSec !== undefined && startSec < 0) {
    throw new Error("ingestStartSec must be >= 0");
  }
  if (endSec !== undefined && endSec <= (startSec ?? 0)) {
    throw new Error(
      startSec !== undefined
        ? "ingestEndSec must be greater than ingestStartSec"
        : "ingestEndSec must be greater than 0",
    );
  }
  return { startSec, endSec };
}

/** Keep only shot intervals overlapping [startSec, endSec]; clamp bounds; renumber indices. */
export function clipDetectedSplitsToWindow(
  splits: DetectedSplit[],
  window: { startSec?: number; endSec?: number },
): DetectedSplit[] {
  const { startSec, endSec } = window;
  if (startSec === undefined && endSec === undefined) {
    return splits;
  }

  const sorted = [...splits].sort((a, b) => a.start - b.start);
  const out: DetectedSplit[] = [];

  for (const s of sorted) {
    let lo = s.start;
    let hi = s.end;
    if (startSec !== undefined) {
      if (hi <= startSec) continue;
      lo = Math.max(lo, startSec);
    }
    if (endSec !== undefined) {
      if (lo >= endSec) continue;
      hi = Math.min(hi, endSec);
    }
    lo = roundTime(lo);
    hi = roundTime(hi);
    if (hi <= lo) continue;
    out.push({ start: lo, end: hi, index: out.length });
  }

  return out;
}

/** Film-absolute [absStart, absEnd) in seconds for a bounded ingest window. */
export type IngestAbsoluteWindow = { absStart: number; absEnd: number };

/**
 * When both start and end are omitted (after parsing), returns null = analyze entire source.
 * Otherwise returns the film-absolute window to analyze.
 * @throws If the window is invalid or end is required but duration is unknown.
 */
export function resolveIngestAbsoluteWindow(
  timeline: { startSec?: number; endSec?: number },
  durationSec: number,
): IngestAbsoluteWindow | null {
  const hasStart = timeline.startSec !== undefined;
  const hasEnd = timeline.endSec !== undefined;
  if (!hasStart && !hasEnd) return null;

  const d = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  let absStart = hasStart ? timeline.startSec! : 0;
  let absEnd = hasEnd ? timeline.endSec! : d;

  absStart = Math.max(0, absStart);
  if (!hasEnd) {
    if (d <= 0) {
      throw new Error(
        "ingestEndSec is required when video duration is unknown (or omit both timeline fields for full-file ingest).",
      );
    }
    absEnd = d;
  }
  if (hasEnd && d > 0) {
    absEnd = Math.min(absEnd, d);
  }
  if (d > 0) {
    absStart = Math.min(absStart, d);
  }

  if (!(absEnd > absStart)) {
    throw new Error("Ingest timeline window is empty or invalid.");
  }
  return { absStart, absEnd };
}

/** Map segment-local split times to film-absolute after detection on a subclip. */
export function offsetDetectedSplits(
  splits: DetectedSplit[],
  offsetSec: number,
): DetectedSplit[] {
  if (offsetSec === 0) return splits;
  return splits.map((s, i) => ({
    ...s,
    index: i,
    start: roundTime(s.start + offsetSec),
    end: roundTime(s.end + offsetSec),
  }));
}

/** Extra boundary cuts are in film-absolute seconds; keep interior cuts and shift into segment-local times. */
export function relativizeAbsoluteBoundaryCutsForSegment(
  cuts: number[],
  absStart: number,
  absEnd: number,
): number[] {
  const out: number[] = [];
  for (const t of cuts) {
    if (!Number.isFinite(t)) continue;
    if (t <= absStart || t >= absEnd) continue;
    out.push(roundTime(t - absStart));
  }
  return out;
}

export async function runCommand(
  command: string,
  args: string[],
  spawnEnv?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  const summarize = (text: string): string => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return "";
    const tail = lines.slice(-8).join("\n");
    return tail.length > 2000 ? tail.slice(-2000) : tail;
  };
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, spawnEnv ? { env: spawnEnv } : undefined);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (err: Error | null, code: number | null) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else if (code === 0) resolve({ stdout, stderr });
      else {
        const cmd = `${command} ${args.join(" ")}`.trim();
        const stderrTail = summarize(stderr);
        const stdoutTail = summarize(stdout);
        const details = [stderrTail, stdoutTail]
          .filter(Boolean)
          .join("\n---\n");
        reject(
          new Error(
            details
              ? `${command} exited with code ${code}.\nCommand: ${cmd}\n${details}`
              : `${command} exited with code ${code}.\nCommand: ${cmd}`,
          ),
        );
      }
    };
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e?.code === "ENOENT") {
        const hint =
          /ffmpeg|ffprobe/i.test(command)
            ? FFMPEG_SPAWN_ENOENT_HINT
            : (process.env.SCENEDETECT_PATH ?? "scenedetect") === command ||
                command.endsWith("scenedetect")
              ? "Install PySceneDetect on the host (`pip install scenedetect`) or set SCENEDETECT_PATH. On Vercel, PySceneDetect is usually absent — ingest falls back to FFmpeg `scene` filter shot cuts when the CLI is missing."
              : `Ensure ${command} is installed and on PATH.`;
        done(new Error(`Command not found: ${command}. ${hint}`), null);
        return;
      }
      done(err, null);
    });
    proc.on("close", (code) => done(null, code));
  });
}

/** Remux one continuous segment; output timeline starts at 0 == `absStart` in the source. */
export async function extractIngestAnalysisSegmentFfmpeg(
  sourcePath: string,
  absStart: number,
  absEnd: number,
  outPath: string,
): Promise<void> {
  const duration = absEnd - absStart;
  if (!(duration > 0)) {
    throw new Error("extractIngestAnalysisSegmentFfmpeg: segment duration must be positive.");
  }
  await runCommand(getFfmpegPath(), [
    "-y",
    "-threads",
    "2",
    "-ss",
    String(absStart),
    "-i",
    sourcePath,
    "-t",
    String(duration),
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    outPath,
  ]);
}

export type IngestTimelineAnalysisPlan = {
  /** Path or URL passed to PySceneDetect / FFmpeg scene for shot detection only. */
  analysisPath: string;
  /**
   * When non-null, `METROVISION_EXTRA_BOUNDARY_CUTS_JSON` and inline cuts are film-absolute;
   * they are filtered and shifted into segment-local times for detection.
   */
  segmentFilmWindow: IngestAbsoluteWindow | null;
  /** Added to split start/end after detection when analysis used a subclip (same as segment start). */
  splitTimeOffsetSec: number;
  disposeSegment: (() => Promise<void>) | null;
};

/**
 * If timeline bounds are set, detection runs on a temp segment (or full source when window covers the file).
 * Extraction/classification must still use the original source + film-absolute split times.
 */
export async function prepareIngestTimelineAnalysisMedia(
  sourceVideoPath: string,
  timeline: { startSec?: number; endSec?: number },
): Promise<IngestTimelineAnalysisPlan> {
  const duration = await probeVideoDurationSec(sourceVideoPath);
  const absWin = resolveIngestAbsoluteWindow(timeline, duration);
  if (!absWin) {
    return {
      analysisPath: sourceVideoPath,
      segmentFilmWindow: null,
      splitTimeOffsetSec: 0,
      disposeSegment: null,
    };
  }
  const { absStart, absEnd } = absWin;
  const d = duration;
  const coversWholeFile =
    Number.isFinite(d) && d > 0 && absStart <= 0.001 && absEnd >= d - 0.05;
  if (coversWholeFile) {
    return {
      analysisPath: sourceVideoPath,
      segmentFilmWindow: null,
      splitTimeOffsetSec: 0,
      disposeSegment: null,
    };
  }
  const segPath = path.join(tmpdir(), `metrovision-ingest-seg-${Date.now()}.mp4`);
  await extractIngestAnalysisSegmentFfmpeg(sourceVideoPath, absStart, absEnd, segPath);
  return {
    analysisPath: segPath,
    segmentFilmWindow: absWin,
    splitTimeOffsetSec: absStart,
    disposeSegment: async () => {
      await rm(segPath, { force: true }).catch(() => {});
    },
  };
}

/**
 * Serverless (Vercel, Lambda) /tmp is ~512MB — remuxing a feature-length source fills disk (ffmpeg exits -28 ENOSPC).
 * In those environments, pass the HTTPS URL through to ffmpeg/PySceneDetect instead of copying locally.
 * Override: `METROVISION_STREAM_REMOTE_VIDEO=1` (always) or `METROVISION_FORCE_LOCAL_VIDEO_REMUX=1` (never skip remux).
 */
export function shouldStreamRemoteIngestInput(): boolean {
  if (process.env.METROVISION_FORCE_LOCAL_VIDEO_REMUX === "1") return false;
  if (process.env.METROVISION_STREAM_REMOTE_VIDEO === "1") return true;
  return process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/** Basename for DB `sourceFile` when `videoPath` may be a presigned URL. */
export function ingestSourceDisplayFileName(videoPathOrUrl: string): string {
  const s = videoPathOrUrl.trim();
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const seg = new URL(s).pathname.split("/").filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg);
    } catch {
      /* ignore */
    }
    return "remote.mp4";
  }
  return path.basename(s);
}

/**
 * Local filesystem path or http(s) URL → path/URL string for PySceneDetect / FFmpeg.
 * HTTP(S): by default FFmpeg remuxes to /tmp (TS worker / beefy hosts). On Vercel/Lambda, returns the URL and skips remux.
 */
export async function resolveIngestVideoToLocalPath(
  videoPathOrUrl: string,
): Promise<{ localPath: string; dispose: () => Promise<void> }> {
  const input = videoPathOrUrl.trim();
  if (!input.startsWith("http://") && !input.startsWith("https://")) {
    const localPath = path.resolve(input);
    await access(localPath, constants.R_OK);
    return { localPath, dispose: async () => {} };
  }

  if (shouldStreamRemoteIngestInput()) {
    return { localPath: input, dispose: async () => {} };
  }

  const downloadDir = path.join(tmpdir(), "metrovision-ingest-downloads");
  await mkdir(downloadDir, { recursive: true });
  const localPath = path.join(downloadDir, `${Date.now()}-source.mp4`);

  await runCommand(getFfmpegPath(), [
    "-y",
    "-threads",
    "2",
    "-i",
    input,
    "-c",
    "copy",
    localPath,
  ]);

  return {
    localPath,
    dispose: async () => {
      await rm(localPath, { force: true }).catch(() => {});
    },
  };
}

export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Parallel batch processor
// ---------------------------------------------------------------------------

export async function processInParallel<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, workerIndex: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(workerIdx: number) {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], workerIdx);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, (_, i) => worker(i)),
  );

  return results;
}

// ---------------------------------------------------------------------------
// Step 1: Detect shot boundaries
// ---------------------------------------------------------------------------

let scenedetectReachableMemo: Promise<boolean> | null = null;

/** PySceneDetect CLI is rarely present on Vercel; result is cached for the process. */
export async function getScenedetectReachable(): Promise<boolean> {
  if (!scenedetectReachableMemo) {
    const bin = process.env.SCENEDETECT_PATH ?? "scenedetect";
    scenedetectReachableMemo = new Promise((resolve) => {
      let settled = false;
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const p = spawn(bin, ["version"], { stdio: "ignore" });
      p.on("error", (err) => {
        const e = err as NodeJS.ErrnoException;
        if (e?.code === "ENOENT") done(false);
        else done(true);
      });
      p.on("close", () => done(true));
    });
  }
  return scenedetectReachableMemo;
}

function ffmpegSceneCutThreshold(): number {
  const raw = process.env.METROVISION_FFMPEG_SCENE_THRESHOLD?.trim();
  if (!raw) return 0.32;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.32;
}

/**
 * Downsample before `scene` to avoid decoding every frame on a remote feature (else “stuck on detect”).
 * `METROVISION_FFMPEG_SCENE_SAMPLE_FPS`: positive number = max analyzed fps, `0`/`full` = no fps filter (slowest, highest recall).
 */
function ffmpegSceneFilterGraph(): string {
  const threshold = ffmpegSceneCutThreshold();
  const raw = process.env.METROVISION_FFMPEG_SCENE_SAMPLE_FPS?.trim()?.toLowerCase();
  let prefix = "";
  if (raw === "0" || raw === "full" || raw === "off") {
    prefix = "";
  } else {
    const fallback = process.env.VERCEL === "1" ? 2 : 4;
    const n = raw ? Number(raw) : fallback;
    const fps =
      Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 0.25), 60) : fallback;
    prefix = `fps=${fps},`;
  }
  return `${prefix}select='gt(scene,${threshold})',showinfo`;
}

/**
 * Shot cuts via FFmpeg `scene` + showinfo (no PySceneDetect).
 * Uses temporal downsampling by default so serverless runs finish in reasonable time.
 */
async function detectShotsWithFfmpegScene(videoPath: string): Promise<DetectedSplit[]> {
  const { stderr } = await runCommand(
    getFfmpegPath(),
    [
      "-hide_banner",
      "-nostats",
      "-threads",
      "2",
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-an",
      "-filter:v",
      ffmpegSceneFilterGraph(),
      "-f",
      "null",
      "-",
    ],
    envWithFfmpegBinariesOnPath(),
  );

  const times: number[] = [];
  for (const line of stderr.split("\n")) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) times.push(roundTime(parseFloat(m[1]!)));
  }
  const uniqTimes = [...new Set(times)].sort((a, b) => a - b);
  const duration = await probeVideoDurationSec(videoPath);
  const d =
    duration > 0
      ? duration
      : uniqTimes.length > 0
        ? uniqTimes[uniqTimes.length - 1]! + 0.001
        : 1;
  if (uniqTimes.length === 0) {
    return [{ start: 0, end: roundTime(d), index: 0 }];
  }
  const boundaries = [
    0,
    ...uniqTimes.filter((t) => t > 0 && t < d),
    d,
  ].sort((a, b) => a - b);
  const uniq = boundaries.filter((t, i, arr) => i === 0 || t > arr[i - 1]!);
  return splitsFromBoundaries(uniq);
}

function mergeEndpointsLikeEnsemble(
  pointList: number[],
  duration: number,
  extraCuts: number[],
  fusionPolicy: BoundaryFusionPolicy = "merge_flat",
  mergeGapSec?: number,
): DetectedSplit[] {
  const d =
    duration > 0 ? duration : Math.max(0, ...pointList, 0);
  const eps =
    mergeGapSec != null && Number.isFinite(mergeGapSec) && mergeGapSec > 0
      ? mergeGapSec
      : boundaryMergeEpsilonSec();
  const interior = [...new Set(pointList.map(roundTime))].filter(
    (t) => t > 0 && t < d,
  );
  let clustered = clusterCutTimes(interior, eps);
  if (extraCuts.length) {
    clustered = fuseBoundaryCutStreams(
      clustered,
      extraCuts.map(roundTime),
      fusionPolicy,
      eps,
    );
  }
  const boundaries = [0, ...clustered.filter((t) => t > 0 && t < d), d].sort(
    (a, b) => a - b,
  );
  const uniq = boundaries.filter(
    (t, i, arr) => i === 0 || t > arr[i - 1]!,
  );
  return splitsFromBoundaries(uniq);
}

export async function detectShots(
  videoPath: string,
  detector: "content" | "adaptive" = "adaptive",
): Promise<DetectedSplit[]> {
  if (!(await getScenedetectReachable())) {
    return detectShotsWithFfmpegScene(videoPath);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-detect-"));
  const csvPath = path.join(tempDir, "shots.csv");

  const scenedetectBin = process.env.SCENEDETECT_PATH ?? "scenedetect";

  const detectorArgs = detector === "adaptive"
    ? ["detect-adaptive", "-t", "3.0"]
    : ["detect-content", "-t", "27.0"];

  await runCommand(
    scenedetectBin,
    [
      "-i", videoPath,
      ...(detector === "content" ? ["-d", "4"] : []),
      ...detectorArgs,
      "list-scenes",
      "-o", tempDir,
      "-f", "shots",
      "-q",
    ],
    envWithFfmpegBinariesOnPath(),
  );

  const csv = await readFile(csvPath, "utf-8").catch(() => "");
  await rm(tempDir, { recursive: true, force: true });

  if (!csv.trim()) {
    const duration = await probeVideoDurationSec(videoPath);
    return [{ start: 0, end: roundTime(duration), index: 0 }];
  }

  const lines = csv.trim().split("\n").slice(2);
  return lines
    .map((line, i) => {
      const cols = line.split(",");
      const start = parseFloat(cols[3]?.trim() ?? "0");
      const end = parseFloat(cols[6]?.trim() ?? "0");
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start: roundTime(start), end: roundTime(end), index: i };
    })
    .filter((s): s is DetectedSplit => s !== null);
}

function endpointsFromSplits(splits: DetectedSplit[]): number[] {
  const out = new Set<number>();
  for (const s of splits) {
    out.add(s.start);
    out.add(s.end);
  }
  return [...out];
}

function splitsFromBoundaries(boundaries: number[]): DetectedSplit[] {
  const b = [...new Set(boundaries.map(roundTime))].sort((a, c) => a - c);
  const splits: DetectedSplit[] = [];
  for (let i = 0; i < b.length - 1; i++) {
    const start = b[i]!;
    const end = b[i + 1]!;
    if (end > start) {
      splits.push({ start, end, index: splits.length });
    }
  }
  return splits;
}

export type DetectShotsContext = {
  usedEnsemble: boolean;
  extraCutsMerged: number;
  resolvedDetector: "content" | "adaptive" | "ensemble";
  boundaryLabel: string;
};

export type DetectShotsForIngestOptions = {
  /** Hard-cut seconds from TransNet / human labeler, merged with file env (`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`). Film-absolute seconds. */
  inlineExtraBoundaryCuts?: number[] | null;
  /**
   * How primary detector interior cuts combine with file + inline extras (`merge_flat` = historical one-pass cluster).
   */
  boundaryFusionPolicy?: BoundaryFusionPolicy;
  /**
   * When `videoPath` is a segment file representing [absStart, absEnd] of the film, pass this so file + inline cuts
   * (film-absolute) are relativized into segment-local times before merging with detector output.
   */
  segmentFilmWindow?: IngestAbsoluteWindow | null;
  /**
   * Per-call boundary policy (Phase 10). When set, overrides `METROVISION_BOUNDARY_DETECTOR` and
   * `METROVISION_BOUNDARY_MERGE_GAP_SEC` for this detection only — no `process.env` mutation.
   */
  boundaryOverrides?: {
    boundaryDetector?: string;
    mergeGapSec?: number;
  };
};

/** Phase D: dual PySceneDetect + NMS, optional `METROVISION_EXTRA_BOUNDARY_CUTS_JSON`. */
export async function detectShotsEnsemble(
  videoPath: string,
  extraCuts: number[],
  fusionPolicy: BoundaryFusionPolicy = "merge_flat",
  mergeGapSec?: number,
): Promise<DetectedSplit[]> {
  const eps =
    mergeGapSec != null && Number.isFinite(mergeGapSec) && mergeGapSec > 0
      ? mergeGapSec
      : boundaryMergeEpsilonSec();

  if (!(await getScenedetectReachable())) {
    const splits = await detectShotsWithFfmpegScene(videoPath);
    const duration = await probeVideoDurationSec(videoPath);
    const pointList = endpointsFromSplits(splits);
    return mergeEndpointsLikeEnsemble(
      pointList,
      duration,
      extraCuts,
      fusionPolicy,
      eps,
    );
  }

  const [adaptive, content, duration] = await Promise.all([
    detectShots(videoPath, "adaptive"),
    detectShots(videoPath, "content"),
    probeVideoDurationSec(videoPath),
  ]);
  const pointList = [...endpointsFromSplits(adaptive), ...endpointsFromSplits(content)];
  const d =
    duration > 0
      ? duration
      : Math.max(0, ...pointList);
  const interior = [...new Set(pointList.map(roundTime))].filter(
    (t) => t > 0 && t < d,
  );
  let clustered = clusterCutTimes(interior, eps);
  if (extraCuts.length) {
    clustered = fuseBoundaryCutStreams(
      clustered,
      extraCuts.map(roundTime),
      fusionPolicy,
      eps,
    );
  }
  const boundaries = [0, ...clustered.filter((t) => t > 0 && t < d), d].sort(
    (a, b) => a - b,
  );
  const uniq = boundaries.filter(
    (t, i, arr) => i === 0 || t > arr[i - 1]!,
  );
  return splitsFromBoundaries(uniq);
}

export async function detectShotsForIngest(
  videoPath: string,
  requestedDetector: "content" | "adaptive",
  options?: DetectShotsForIngestOptions,
): Promise<{ splits: DetectedSplit[]; ctx: DetectShotsContext }> {
  const pysceneCliAvailable = await getScenedetectReachable();
  const seg = options?.segmentFilmWindow ?? null;
  const fileCutsRaw = loadExtraBoundaryCuts();
  const inlineCutsRaw = options?.inlineExtraBoundaryCuts ?? [];
  const fileCuts =
    seg != null
      ? relativizeAbsoluteBoundaryCutsForSegment(
          fileCutsRaw,
          seg.absStart,
          seg.absEnd,
        )
      : fileCutsRaw;
  const inlineCuts =
    seg != null
      ? relativizeAbsoluteBoundaryCutsForSegment(
          inlineCutsRaw,
          seg.absStart,
          seg.absEnd,
        )
      : inlineCutsRaw;
  const extra = mergeBoundaryCutSources(fileCuts, inlineCuts);
  const tagSuffix = boundaryExtraTag(fileCuts.length, inlineCuts.length);
  const fusionPolicy = options?.boundaryFusionPolicy ?? "merge_flat";

  const mergeGap =
    options?.boundaryOverrides?.mergeGapSec != null &&
    Number.isFinite(options.boundaryOverrides.mergeGapSec) &&
    options.boundaryOverrides.mergeGapSec > 0
      ? options.boundaryOverrides.mergeGapSec
      : boundaryMergeEpsilonSec();
  const modeStr =
    options?.boundaryOverrides?.boundaryDetector?.trim() || boundaryModeFromEnv();
  const useEnsemble = shouldRunPysceneEnsembleForMode(modeStr);

  if (useEnsemble) {
    const splits = await detectShotsEnsemble(
      videoPath,
      extra,
      fusionPolicy,
      mergeGap,
    );
    return {
      splits,
      ctx: {
        usedEnsemble: true,
        extraCutsMerged: extra.length,
        resolvedDetector: "ensemble",
        boundaryLabel: pysceneCliAvailable
          ? `pyscenedetect_ensemble_pyscene${tagSuffix}`
          : `ffmpeg_scene+ensemble_fallback${tagSuffix}`,
      },
    };
  }

  let splits = await detectShots(videoPath, requestedDetector);
  const duration = await probeVideoDurationSec(videoPath);
  if (extra.length > 0) {
    const d =
      duration > 0
        ? duration
        : Math.max(0, ...endpointsFromSplits(splits));
    const eps = mergeGap;
    const interior = [...new Set(endpointsFromSplits(splits).map(roundTime))].filter(
      (t) => t > 0 && t < d,
    );
    const clustered =
      fusionPolicy === "merge_flat"
        ? clusterCutTimes(
            [...interior, ...extra.map(roundTime)],
            eps,
          )
        : fuseBoundaryCutStreams(
            clusterCutTimes(interior, eps),
            extra.map(roundTime),
            fusionPolicy,
            eps,
          );
    const boundaries = [
      0,
      ...clustered.filter((t) => t > 0 && t < d),
      d,
    ].sort((a, b) => a - b);
    const uniq = boundaries.filter(
      (t, i, arr) => i === 0 || t > arr[i - 1]!,
    );
    splits = splitsFromBoundaries(uniq);
  }

  const mode = modeStr;
  const baseLabel = !pysceneCliAvailable
    ? "ffmpeg_scene"
    : mode === "pyscenedetect_cli"
      ? `pyscenedetect_cli_${requestedDetector}`
      : `${mode}_${requestedDetector}`;
  const boundaryLabel = `${baseLabel}${tagSuffix}`;

  return {
    splits,
    ctx: {
      usedEnsemble: false,
      extraCutsMerged: extra.length,
      resolvedDetector: requestedDetector,
      boundaryLabel,
    },
  };
}

// ---------------------------------------------------------------------------
// Step 2: Extract clip + thumbnail (OPTIMIZED)
// - Smaller thumbnail (320px)
// - Extract clip + thumb in parallel FFmpeg calls
// - Defer S3 upload — return local paths, upload separately
// ---------------------------------------------------------------------------

export type ExtractedAssets = {
  clipPath: string;
  thumbPath: string;
  clipKey: string;
  thumbnailKey: string;
};

export async function extractLocally(
  videoPath: string,
  split: DetectedSplit,
  filmSlug: string,
  outputDir: string,
): Promise<ExtractedAssets> {
  const shotName = `shot-${String(split.index + 1).padStart(3, "0")}`;
  const clipPath = path.join(outputDir, `${shotName}.mp4`);
  const thumbPath = path.join(outputDir, `${shotName}.jpg`);
  const midpoint = split.start + (split.end - split.start) / 2;

  // Run clip extraction + thumbnail in parallel (2 FFmpeg calls at once)
  await Promise.all([
    runCommand(getFfmpegPath(), [
      "-y", "-ss", String(split.start), "-to", String(split.end),
      "-i", videoPath, "-c", "copy", "-avoid_negative_ts", "make_zero",
      clipPath,
    ]),
    runCommand(getFfmpegPath(), [
      "-y", "-ss", String(midpoint), "-i", videoPath,
      "-frames:v", "1", "-q:v", "3", "-vf", "scale=320:trunc(ow/a/2)*2",
      thumbPath,
    ]),
  ]);

  return {
    clipPath,
    thumbPath,
    clipKey: buildS3Key(filmSlug, "clips", `${shotName}.mp4`),
    thumbnailKey: buildS3Key(filmSlug, "thumbnails", `${shotName}.jpg`),
  };
}

/**
 * Upload extracted assets to S3 (called after extraction, can be batched).
 */
export async function uploadAssets(
  assets: ExtractedAssets,
): Promise<{ clipKey: string; thumbnailKey: string }> {
  const [clipBuf, thumbBuf] = await Promise.all([
    readFile(assets.clipPath),
    readFile(assets.thumbPath),
  ]);

  await Promise.all([
    uploadToS3(assets.clipKey, clipBuf, "video/mp4"),
    uploadToS3(assets.thumbnailKey, thumbBuf, "image/jpeg"),
  ]);

  return { clipKey: assets.clipKey, thumbnailKey: assets.thumbnailKey };
}

/**
 * Legacy combined extract + upload (for backward compat).
 */
export async function extractAndUpload(
  videoPath: string,
  split: DetectedSplit,
  filmSlug: string,
): Promise<{ clipKey: string; thumbnailKey: string }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-clip-"));
  try {
    const assets = await extractLocally(videoPath, split, filmSlug, tempDir);
    return uploadAssets(assets);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Step 3: Classify with Gemini (OPTIMIZED)
// - Smaller clips: 320px, max 10s, higher CRF
// - Each shot spawns FFmpeg (libx264); cap parallelism to avoid EAGAIN / filter init failures.
// ---------------------------------------------------------------------------

/**
 * Parallel Gemini classifies each run FFmpeg for a subclip — too many at once exhausts CPU/FDs.
 * Override: `METROVISION_CLASSIFY_CONCURRENCY` (1–32). Default caps at 4 unless env set (Railway/small VMs: fewer parallel FFmpeg encodes).
 */
export function resolveGeminiClassifyParallelism(formConcurrency: number): number {
  const raw = process.env.METROVISION_CLASSIFY_CONCURRENCY?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 32) return Math.floor(n);
  }
  const suggested = Math.max(2, Math.round(formConcurrency * 2));
  return Math.min(suggested, 4);
}

function fallbackClassification(): ClassifiedShot {
  return {
    framing: "centered", depth: "medium", blocking: "single", symmetry: "balanced",
    dominant_lines: "none", lighting_direction: "natural", lighting_quality: "soft",
    color_temperature: "neutral", foreground_elements: [], background_elements: [],
    shot_size: "medium", angle_vertical: "eye_level", angle_horizontal: "frontal",
    duration_cat: "standard",
    description: "Classification unavailable — fallback applied", mood: "neutral",
    lighting: "unknown", subjects: [], scene_title: "Unclassified",
    scene_description: "", location: "unknown", interior_exterior: "interior", time_of_day: "day",
  };
}

export type ClassifyShotResult = {
  classification: ClassifiedShot;
  /** True when both primary and optional adjudicator models failed — template row used. */
  usedFallback: boolean;
};

export async function classifyShot(
  videoPath: string,
  split: DetectedSplit,
  filmTitle: string,
  director: string,
  year: number,
  castList: string[],
): Promise<ClassifyShotResult> {
  try {
    return await classifyShotWithGemini(
      videoPath,
      split,
      filmTitle,
      director,
      year,
      castList,
    );
  } catch (err) {
    console.error(`[classify] Shot ${split.index} failed, using fallback:`, (err as Error).message);
    return { classification: fallbackClassification(), usedFallback: true };
  }
}

function buildClassificationPrompt(
  filmTitle: string,
  year: number,
  director: string,
  castList: string[],
  split: DetectedSplit,
  adjudicatorRetry: boolean,
): string {
  const adjudicatorNote = adjudicatorRetry
    ? "\n\nYour previous model returned invalid JSON. Respond with ONLY a single valid JSON object matching the schema, no markdown."
    : "";
  return `Shot composition analysis: "${filmTitle}" (${year}, ${director}).
${castList.length > 0 ? `Cast: ${castList.slice(0, 8).join(", ")}` : ""}
TC: ${formatTimecode(split.start)}-${formatTimecode(split.end)} (${(split.end - split.start).toFixed(1)}s)

Analyze the COMPOSITION of this shot — what is in the frame, how it is arranged, and how it is lit. Use the keyframe (freeze the midpoint in your mind).

Return JSON: {"framing","depth","blocking","symmetry","dominant_lines","lighting_direction","lighting_quality","color_temperature","foreground_elements","background_elements","shot_size","angle_vertical","angle_horizontal","duration_cat","description","mood","lighting","subjects","scene_title","scene_description","location","interior_exterior","time_of_day"}

Valid values:
framing: rule_of_thirds_left/rule_of_thirds_right/centered/off_center/split/frame_within_frame/negative_space_dominant/filled/leading_lines/golden_ratio
depth: shallow/medium/deep_staging/flat/layered/rack_focus
blocking: single/two_figure/two_figure_separation/group/crowd/empty/silhouette/reflection
symmetry: symmetric/asymmetric/balanced/unbalanced
dominant_lines: vertical/horizontal/diagonal/curved/converging/radiating/none
lighting_direction: front/side/back/top/bottom/natural/mixed
lighting_quality: hard/soft/diffused/high_contrast/low_contrast/chiaroscuro
color_temperature: warm/cool/neutral/mixed/desaturated/saturated
shot_size: extreme_wide/wide/full/medium_wide/medium/medium_close/close/extreme_close/insert/two_shot/three_shot/group/ots/pov/reaction
angle_vertical: eye_level/high_angle/low_angle/birds_eye/worms_eye/overhead
angle_horizontal: frontal/profile/three_quarter/rear/ots
duration_cat: flash/brief/standard/extended/long_take/oner
foreground_elements: array of strings (objects/people in foreground)
background_elements: array of strings (objects/environment in background)
Only valid JSON.${adjudicatorNote}`;
}

function parseGeminiClassificationJson(result: unknown): ClassifiedShot | null {
  if (!result || typeof result !== "object") return null;
  const rec = result as { candidates?: unknown[] };
  if (!rec.candidates?.length) return null;

  const candidate = rec.candidates[0] as {
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  };
  if (
    candidate.finishReason &&
    candidate.finishReason !== "STOP" &&
    candidate.finishReason !== "MAX_TOKENS" &&
    candidate.finishReason !== "FINISH_REASON_UNSPECIFIED"
  ) {
    return null;
  }

  const parts = candidate?.content?.parts ?? [];
  let fullText = "";
  for (const part of parts) {
    if (part.text) fullText += part.text + "\n";
  }
  if (!fullText.trim()) fullText = parts?.[0]?.text ?? "";
  fullText = fullText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  try {
    const t = fullText.trim();
    const direct = JSON.parse(t) as unknown;
    if (direct && typeof direct === "object") {
      if (!Array.isArray(direct)) {
        return direct as ClassifiedShot;
      }
      const first = (direct as unknown[])[0];
      if (first && typeof first === "object" && !Array.isArray(first)) {
        return first as ClassifiedShot;
      }
    }
  } catch {
    /* try balanced-object extraction */
  }

  const extracted = extractFirstJsonObject(fullText);
  if (!extracted) return null;
  try {
    return JSON.parse(extracted) as ClassifiedShot;
  } catch {
    return null;
  }
}

async function geminiGenerateClassification(
  base64Video: string,
  prompt: string,
  model: string,
): Promise<ClassifiedShot | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set.");

  await acquireToken();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: "video/mp4", data: base64Video } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          /** Full composition JSON is large; 1024 often truncates mid-object → silent fallbacks. */
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const bodyText = await response.text();
  let result: unknown;
  try {
    result = JSON.parse(bodyText) as unknown;
  } catch {
    console.warn(
      `[classify] Gemini HTTP body is not valid JSON (truncated proxy?): ${bodyText.slice(0, 500)}`,
    );
    return null;
  }
  const parsed = parseGeminiClassificationJson(result);
  if (!parsed) {
    logClassificationParseFailure(
      `Unparseable classification JSON — ${summarizeGeminiClassificationFailure(result)}`,
    );
  }
  return parsed;
}

async function classifyShotWithGemini(
  videoPath: string,
  split: DetectedSplit,
  filmTitle: string,
  director: string,
  year: number,
  castList: string[],
): Promise<ClassifyShotResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set.");

  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-gemini-"));
  const clipDuration = Math.min(split.end - split.start, 10);
  const clipFile = path.join(tempDir, "clip.mp4");

  const classifyFfmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(split.start),
    "-t",
    String(clipDuration),
    "-i",
    videoPath,
    "-threads",
    "1",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "32",
    "-vf",
    "scale=320:trunc(ih*320/iw/2)*2:flags=fast_bilinear",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "12",
    "-an",
    clipFile,
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await runCommand(getFfmpegPath(), classifyFfmpegArgs);
      break;
    } catch (e) {
      const lastFfmpegErr = e as Error;
      const msg = lastFfmpegErr.message;
      const retryable =
        /Resource temporarily unavailable|Failed to configure output pad|Error reinitializing filters|EAGAIN/i.test(
          msg,
        );
      if (!retryable || attempt === 1) throw lastFfmpegErr;
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 500));
    }
  }

  try {
    const clipBuffer = await readFile(clipFile);
    const base64Video = clipBuffer.toString("base64");

    const primaryModel = getGeminiClassifyModel();
    const promptPrimary = buildClassificationPrompt(
      filmTitle,
      year,
      director,
      castList,
      split,
      false,
    );
    let parsed = await geminiGenerateClassification(base64Video, promptPrimary, primaryModel);
    if (parsed) {
      return { classification: sanitizeClassifiedShot(parsed), usedFallback: false };
    }

    const adjudicator = getGeminiAdjudicateModel();
    if (adjudicator) {
      const promptAdj = buildClassificationPrompt(
        filmTitle,
        year,
        director,
        castList,
        split,
        true,
      );
      parsed = await geminiGenerateClassification(base64Video, promptAdj, adjudicator);
      if (parsed) {
        return { classification: sanitizeClassifiedShot(parsed), usedFallback: false };
      }
    }

    return { classification: fallbackClassification(), usedFallback: true };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

