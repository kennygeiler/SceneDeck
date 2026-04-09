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
  shouldRunPysceneEnsemble,
} from "./boundary-ensemble";
import {
  getGeminiAdjudicateModel,
  getGeminiClassifyModel,
} from "./pipeline-provenance";

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

export async function runCommand(
  command: string,
  args: string[],
  spawnEnv?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
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
      else reject(new Error(stderr || `${command} exited with code ${code}`));
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
): DetectedSplit[] {
  const d =
    duration > 0 ? duration : Math.max(0, ...pointList, 0);
  const eps = boundaryMergeEpsilonSec();
  const interior = [...new Set(pointList.map(roundTime))].filter(
    (t) => t > 0 && t < d,
  );
  let clustered = clusterCutTimes(interior, eps);
  if (extraCuts.length) {
    clustered = clusterCutTimes(
      [...clustered, ...extraCuts.map(roundTime)],
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
  /** Hard-cut seconds from TransNet / human labeler, merged with file env (`METROVISION_EXTRA_BOUNDARY_CUTS_JSON`). */
  inlineExtraBoundaryCuts?: number[] | null;
};

/** Phase D: dual PySceneDetect + NMS, optional `METROVISION_EXTRA_BOUNDARY_CUTS_JSON`. */
export async function detectShotsEnsemble(
  videoPath: string,
  extraCuts: number[],
): Promise<DetectedSplit[]> {
  if (!(await getScenedetectReachable())) {
    const splits = await detectShotsWithFfmpegScene(videoPath);
    const duration = await probeVideoDurationSec(videoPath);
    const pointList = endpointsFromSplits(splits);
    return mergeEndpointsLikeEnsemble(pointList, duration, extraCuts);
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
  const eps = boundaryMergeEpsilonSec();
  const interior = [...new Set(pointList.map(roundTime))].filter(
    (t) => t > 0 && t < d,
  );
  let clustered = clusterCutTimes(interior, eps);
  if (extraCuts.length) {
    clustered = clusterCutTimes(
      [...clustered, ...extraCuts.map(roundTime)],
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
  const fileCuts = loadExtraBoundaryCuts();
  const inlineCuts = options?.inlineExtraBoundaryCuts ?? [];
  const extra = mergeBoundaryCutSources(fileCuts, inlineCuts);
  const tagSuffix = boundaryExtraTag(fileCuts.length, inlineCuts.length);

  if (shouldRunPysceneEnsemble()) {
    const splits = await detectShotsEnsemble(videoPath, extra);
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
    const eps = boundaryMergeEpsilonSec();
    const interior = [...new Set(endpointsFromSplits(splits).map(roundTime))].filter(
      (t) => t > 0 && t < d,
    );
    const clustered = clusterCutTimes(
      [...interior, ...extra.map(roundTime)],
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

  const mode = boundaryModeFromEnv();
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
// - Supports batch classification (multiple shots per call)
// ---------------------------------------------------------------------------

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
    candidate.finishReason !== "MAX_TOKENS"
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
  const jsonMatch = fullText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]) as ClassifiedShot;
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
          maxOutputTokens: 1024,
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

  const result = await response.json();
  return parseGeminiClassificationJson(result);
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

  await runCommand(getFfmpegPath(), [
    "-y", "-ss", String(split.start), "-t", String(clipDuration),
    "-i", videoPath, "-c:v", "libx264", "-crf", "32",
    "-vf", "scale=320:trunc(ow/a/2)*2", "-r", "12", "-an", clipFile,
  ]);

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
