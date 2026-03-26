import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { uploadToS3, buildS3Key } from "@/lib/s3";
import { acquireToken } from "@/lib/rate-limiter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DetectedSplit = {
  start: number;
  end: number;
  index: number;
};

export type ClassifiedShot = {
  framing: string;
  depth: string;
  blocking: string;
  symmetry: string;
  dominant_lines: string;
  lighting_direction: string;
  lighting_quality: string;
  color_temperature: string;
  foreground_elements: string[];
  background_elements: string[];
  shot_size: string;
  angle_vertical: string;
  angle_horizontal: string;
  duration_cat: string;
  description: string;
  mood: string;
  lighting: string;
  subjects: string[];
  scene_title: string;
  scene_description: string;
  location: string;
  interior_exterior: string;
  time_of_day: string;
};

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

export async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr || `${command} exited with code ${code}`));
    });
  });
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

export async function detectShots(
  videoPath: string,
  detector: "content" | "adaptive" = "content",
): Promise<DetectedSplit[]> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-detect-"));
  const csvPath = path.join(tempDir, "shots.csv");

  const scenedetectBin = process.env.SCENEDETECT_PATH ?? "scenedetect";

  const detectorArgs = detector === "adaptive"
    ? ["detect-adaptive", "-t", "3.0"]
    : ["detect-content", "-t", "27.0"];

  await runCommand(scenedetectBin, [
    "-i", videoPath,
    ...(detector === "content" ? ["-d", "4"] : []),
    ...detectorArgs,
    "list-scenes",
    "-o", tempDir,
    "-f", "shots",
    "-q",
  ]);

  const csv = await readFile(csvPath, "utf-8").catch(() => "");
  await rm(tempDir, { recursive: true, force: true });

  if (!csv.trim()) {
    const { stdout } = await runCommand("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    const duration = parseFloat(stdout.trim()) || 0;
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
    runCommand("ffmpeg", [
      "-y", "-ss", String(split.start), "-to", String(split.end),
      "-i", videoPath, "-c", "copy", "-avoid_negative_ts", "make_zero",
      clipPath,
    ]),
    runCommand("ffmpeg", [
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

export async function classifyShot(
  videoPath: string,
  split: DetectedSplit,
  filmTitle: string,
  director: string,
  year: number,
  castList: string[],
): Promise<ClassifiedShot> {
  try {
    return await _classifyShotInner(videoPath, split, filmTitle, director, year, castList);
  } catch (err) {
    console.error(`[classify] Shot ${split.index} failed, using fallback:`, (err as Error).message);
    return fallbackClassification();
  }
}

async function _classifyShotInner(
  videoPath: string,
  split: DetectedSplit,
  filmTitle: string,
  director: string,
  year: number,
  castList: string[],
): Promise<ClassifiedShot> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set.");

  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-gemini-"));
  // OPTIMIZATION: max 10s clip at 320px, higher CRF = smaller file = faster upload
  const clipDuration = Math.min(split.end - split.start, 10);
  const clipFile = path.join(tempDir, "clip.mp4");

  await runCommand("ffmpeg", [
    "-y", "-ss", String(split.start), "-t", String(clipDuration),
    "-i", videoPath, "-c:v", "libx264", "-crf", "32",
    "-vf", "scale=320:trunc(ow/a/2)*2", "-r", "12", "-an", clipFile,
  ]);

  try {
    const clipBuffer = await readFile(clipFile);
    const base64Video = clipBuffer.toString("base64");

    const prompt = `Shot composition analysis: "${filmTitle}" (${year}, ${director}).
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
Only valid JSON.`;

    await acquireToken();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: "video/mp4", data: base64Video } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: "application/json" },
        }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errText.slice(0, 200)}`);
    }

    const result = await response.json();

    if (!result?.candidates?.length) {
      return fallbackClassification();
    }

    const candidate = result.candidates[0];
    if (candidate.finishReason && candidate.finishReason !== "STOP" && candidate.finishReason !== "MAX_TOKENS") {
      return fallbackClassification();
    }

    const parts = candidate?.content?.parts ?? [];
    let fullText = "";
    for (const part of parts) {
      if (part.text) fullText += part.text + "\n";
    }
    if (!fullText.trim()) fullText = parts?.[0]?.text ?? "";
    fullText = fullText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackClassification();

    try {
      return JSON.parse(jsonMatch[0]) as ClassifiedShot;
    } catch {
      return fallbackClassification();
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
