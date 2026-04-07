import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import Replicate from "replicate";
import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { acquireToken } from "@/lib/rate-limiter";
import type {
  ShotObjectAttributes,
  ShotObjectKeyframe,
  ShotSceneContext,
} from "@/db/schema";
import { fetchTmdbCast } from "@/lib/tmdb";

export const GEMINI_OBJECT_MODEL = "gemini-2.5-flash";
export const OBJECT_SAMPLE_INTERVAL_SECONDS = 1;
export const YOLO_REPLICATE_MODEL =
  process.env.REPLICATE_YOLO_MODEL?.trim() ||
  "adirik/grounding-dino:efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa";
const YOLO_REPLICATE_MODEL_REF = YOLO_REPLICATE_MODEL as `${string}/${string}:${string}`;

const YOLO_CONFIDENCE_THRESHOLD = 0.25;
const TRACK_LINK_IOU_THRESHOLD = 0.3;
const MATCH_FRAME_GAP = 1;

type FilmContext = {
  title: string;
  director: string;
  year: number | null;
  tmdbId: number | null;
};

type NormalizedBbox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type SampledFrame = {
  frameIndex: number;
  timestamp: number;
  filePath: string;
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  detections: YoloDetection[];
};

export type YoloDetection = {
  class: string;
  confidence: number;
  bbox: NormalizedBbox;
};

export type Enrichment = {
  yoloIndex: number;
  cinematicLabel: string | null;
  description: string | null;
  significance: string | null;
  attributes: ShotObjectAttributes | null;
};

export type ObjectTrack = {
  trackId: string;
  label: string;
  category: string | null;
  confidence: number | null;
  yoloClass: string | null;
  yoloConfidence: number | null;
  cinematicLabel: string | null;
  description: string | null;
  significance: string | null;
  keyframes: ShotObjectKeyframe[];
  startTime: number;
  endTime: number;
  attributes: ShotObjectAttributes | null;
  sceneContext: ShotSceneContext | null;
};

export type StoredObjectTrack = ObjectTrack & {
  id: string;
};

type MutableTrack = ObjectTrack & {
  bestFrameIndex: number;
  lastFrameIndex: number;
  lastBbox: NormalizedBbox;
};

type RawEnrichment = {
  yolo_index?: unknown;
  cinematic_label?: unknown;
  description?: unknown;
  significance?: unknown;
  attributes?: unknown;
};

type RawEnrichmentPayload = {
  enrichments?: unknown;
  scene_context?: unknown;
  sceneContext?: unknown;
};

let replicateClient: Replicate | null = null;

function resolveGeminiApiKey(apiKey?: string) {
  const resolvedApiKey =
    apiKey?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();

  if (!resolvedApiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is not set.");
  }

  return resolvedApiKey;
}

function resolveReplicateApiToken() {
  const token = process.env.REPLICATE_API_TOKEN?.trim();

  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not set.");
  }

  return token;
}

function getReplicateClient() {
  replicateClient ??= new Replicate({
    auth: resolveReplicateApiToken(),
    useFileOutput: false,
  });

  return replicateClient;
}

function roundNumber(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function roundTime(value: number) {
  return roundNumber(value, 3);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampUnitInterval(value: number) {
  return clamp(roundNumber(value), 0, 1);
}

function normalizeConfidence(value: unknown) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized)) {
    return null;
  }

  return clampUnitInterval(normalized);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAttributes(value: unknown): ShotObjectAttributes | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value).flatMap(([key, entryValue]) => {
    const normalizedKey = key.trim();
    const normalizedValue =
      typeof entryValue === "string" ||
      typeof entryValue === "number" ||
      typeof entryValue === "boolean"
        ? String(entryValue).trim()
        : "";

    if (!normalizedKey || !normalizedValue) {
      return [];
    }

    return [[normalizedKey, normalizedValue] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function normalizeSceneContext(value: unknown): ShotSceneContext | null {
  if (!isRecord(value)) {
    return null;
  }

  const location = normalizeString(value.location);
  const interiorExterior = normalizeString(
    value.interior_exterior ?? value.interiorExterior,
  );
  const timeOfDay = normalizeString(value.time_of_day ?? value.timeOfDay);
  const period = normalizeString(value.period);
  const mood = normalizeString(value.mood);
  const weather = normalizeString(value.weather);

  const sceneContext = {
    ...(location ? { location } : {}),
    ...(interiorExterior ? { interiorExterior } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(period ? { period } : {}),
    ...(mood ? { mood } : {}),
    ...(weather ? { weather } : {}),
  } satisfies ShotSceneContext;

  return Object.keys(sceneContext).length > 0 ? sceneContext : null;
}

function getMimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function getVideoMimeTypeFromPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".m4v":
      return "video/x-m4v";
    case ".mp4":
    default:
      return "video/mp4";
  }
}

function extractJsonObject(payload: string) {
  const trimmed = payload.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?/u, "").replace(/```$/u, "").trim()
    : trimmed;
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Response did not contain a JSON object.");
  }

  return JSON.parse(unfenced.slice(start, end + 1)) as unknown;
}

function createTrackId(index: number) {
  return `T${index + 1}`;
}

function bboxToCorners(bbox: NormalizedBbox) {
  return {
    x1: bbox.x,
    y1: bbox.y,
    x2: bbox.x + bbox.w,
    y2: bbox.y + bbox.h,
  };
}

function iou(left: NormalizedBbox, right: NormalizedBbox) {
  const a = bboxToCorners(left);
  const b = bboxToCorners(right);
  const overlapWidth = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const overlapHeight = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = overlapWidth * overlapHeight;

  if (intersection <= 0) {
    return 0;
  }

  const leftArea = left.w * left.h;
  const rightArea = right.w * right.h;

  return intersection / (leftArea + rightArea - intersection);
}

function toNormalizedFromTopLeft(
  x: number,
  y: number,
  w: number,
  h: number,
  maxWidth: number,
  maxHeight: number,
) {
  const left = x <= 1 ? x : x / maxWidth;
  const top = y <= 1 ? y : y / maxHeight;
  const width = w <= 1 ? w : w / maxWidth;
  const height = h <= 1 ? h : h / maxHeight;

  if (![left, top, width, height].every(Number.isFinite)) {
    return null;
  }

  const normalizedX = clampUnitInterval(left);
  const normalizedY = clampUnitInterval(top);
  const normalizedW = clamp(roundNumber(width), 0, 1 - normalizedX);
  const normalizedH = clamp(roundNumber(height), 0, 1 - normalizedY);

  if (normalizedW <= 0 || normalizedH <= 0) {
    return null;
  }

  return {
    x: normalizedX,
    y: normalizedY,
    w: normalizedW,
    h: normalizedH,
  } satisfies NormalizedBbox;
}

function toNormalizedFromCenter(
  x: number,
  y: number,
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const normalizedCenterX = x <= 1 ? x : x / maxWidth;
  const normalizedCenterY = y <= 1 ? y : y / maxHeight;
  const normalizedWidth = width <= 1 ? width : width / maxWidth;
  const normalizedHeight = height <= 1 ? height : height / maxHeight;

  return toNormalizedFromTopLeft(
    normalizedCenterX - normalizedWidth / 2,
    normalizedCenterY - normalizedHeight / 2,
    normalizedWidth,
    normalizedHeight,
    1,
    1,
  );
}

function toNormalizedFromCorners(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxWidth: number,
  maxHeight: number,
) {
  const left = x1 <= 1 ? x1 : x1 / maxWidth;
  const top = y1 <= 1 ? y1 : y1 / maxHeight;
  const right = x2 <= 1 ? x2 : x2 / maxWidth;
  const bottom = y2 <= 1 ? y2 : y2 / maxHeight;

  return toNormalizedFromTopLeft(
    left,
    top,
    right - left,
    bottom - top,
    1,
    1,
  );
}

function normalizeBboxCandidate(
  candidate: Record<string, unknown>,
  imageWidth: number,
  imageHeight: number,
) {
  const box = candidate.box;
  if (isRecord(box)) {
    const x1 = Number(box.x1 ?? box.left ?? box.xmin);
    const y1 = Number(box.y1 ?? box.top ?? box.ymin);
    const x2 = Number(box.x2 ?? box.right ?? box.xmax);
    const y2 = Number(box.y2 ?? box.bottom ?? box.ymax);

    if ([x1, y1, x2, y2].every(Number.isFinite)) {
      return toNormalizedFromCorners(x1, y1, x2, y2, imageWidth, imageHeight);
    }
  }

  if (Array.isArray(candidate.bbox) && candidate.bbox.length === 4) {
    const [a, b, c, d] = candidate.bbox.map((value) => Number(value));

    if ([a, b, c, d].every(Number.isFinite)) {
      return c > a && d > b
        ? toNormalizedFromCorners(a, b, c, d, imageWidth, imageHeight)
        : toNormalizedFromTopLeft(a, b, c, d, imageWidth, imageHeight);
    }
  }

  const x1 = Number(candidate.x1 ?? candidate.left ?? candidate.xmin);
  const y1 = Number(candidate.y1 ?? candidate.top ?? candidate.ymin);
  const x2 = Number(candidate.x2 ?? candidate.right ?? candidate.xmax);
  const y2 = Number(candidate.y2 ?? candidate.bottom ?? candidate.ymax);
  if ([x1, y1, x2, y2].every(Number.isFinite)) {
    return toNormalizedFromCorners(x1, y1, x2, y2, imageWidth, imageHeight);
  }

  const centerX = Number(candidate.x ?? candidate.cx ?? candidate.center_x);
  const centerY = Number(candidate.y ?? candidate.cy ?? candidate.center_y);
  const width = Number(candidate.width);
  const height = Number(candidate.height);
  if ([centerX, centerY, width, height].every(Number.isFinite)) {
    return toNormalizedFromCenter(
      centerX,
      centerY,
      width,
      height,
      imageWidth,
      imageHeight,
    );
  }

  const left = Number(candidate.x ?? candidate.left);
  const top = Number(candidate.y ?? candidate.top);
  const rawWidth = Number(candidate.w ?? candidate.box_width);
  const rawHeight = Number(candidate.h ?? candidate.box_height);
  if ([left, top, rawWidth, rawHeight].every(Number.isFinite)) {
    return toNormalizedFromTopLeft(
      left,
      top,
      rawWidth,
      rawHeight,
      imageWidth,
      imageHeight,
    );
  }

  return null;
}

function normalizeYoloDetection(
  candidate: Record<string, unknown>,
  imageWidth: number,
  imageHeight: number,
) {
  const className = normalizeString(
    candidate.class_name ??
      candidate.class ??
      candidate.label ??
      candidate.name ??
      candidate.category,
  )
    .toLowerCase()
    .replace(/\s+/gu, "_");
  const confidence = normalizeConfidence(
    candidate.confidence ?? candidate.score ?? candidate.probability,
  );
  const bbox = normalizeBboxCandidate(candidate, imageWidth, imageHeight);

  if (!className || confidence === null || !bbox) {
    return null;
  }

  return {
    class: className,
    confidence,
    bbox,
  } satisfies YoloDetection;
}

function isDetectionCandidate(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const keys = new Set(Object.keys(value));

  return (
    keys.has("bbox") ||
    keys.has("box") ||
    keys.has("x1") ||
    keys.has("xmin") ||
    (keys.has("x") && keys.has("y") && (keys.has("width") || keys.has("w")))
  );
}

async function fetchStructuredUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as unknown;
    }

    if (contentType.startsWith("text/") || contentType.includes("application/octet-stream")) {
      const text = await response.text();
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        return JSON.parse(text) as unknown;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function expandStructuredPayload(value: unknown, results: unknown[]) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        results.push(JSON.parse(trimmed));
      } catch {
        results.push(trimmed);
      }
      return;
    }

    if (/^https?:\/\//u.test(trimmed)) {
      const remotePayload = await fetchStructuredUrl(trimmed);
      if (remotePayload !== null) {
        results.push(remotePayload);
      }
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      await expandStructuredPayload(entry, results);
    }
    results.push(value);
    return;
  }

  if (isRecord(value)) {
    if (typeof value.blob === "function") {
      try {
        const blob = await value.blob();
        const text = await blob.text();
        await expandStructuredPayload(text, results);
      } catch {
        return;
      }
    }

    for (const entryValue of Object.values(value)) {
      await expandStructuredPayload(entryValue, results);
    }

    results.push(value);
  }
}

function collectDetectionCandidates(value: unknown, candidates: Array<Record<string, unknown>>) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectDetectionCandidates(entry, candidates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (isDetectionCandidate(value)) {
    candidates.push(value);
  }

  for (const entryValue of Object.values(value)) {
    collectDetectionCandidates(entryValue, candidates);
  }
}

function dedupeDetections(detections: YoloDetection[]) {
  const seen = new Set<string>();

  return detections.filter((detection) => {
    const key = [
      detection.class,
      roundNumber(detection.bbox.x, 3),
      roundNumber(detection.bbox.y, 3),
      roundNumber(detection.bbox.w, 3),
      roundNumber(detection.bbox.h, 3),
    ].join(":");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(stderr.trim() || `${command} exited with code ${code ?? "unknown"}.`),
      );
    });
  });
}

async function probeImageDimensions(filePath: string) {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    filePath,
  ]);

  const payload = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
  };
  const stream = payload.streams?.[0];
  const width = Number(stream?.width);
  const height = Number(stream?.height);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Could not determine frame dimensions for ${filePath}.`);
  }

  return { width, height };
}

async function extractFrameImage(
  videoPath: string,
  timestamp: number,
  frameIndex: number,
  outputDir: string,
) {
  const framePath = path.join(outputDir, `frame_${frameIndex}.png`);

  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    roundTime(timestamp).toFixed(3),
    "-i",
    videoPath,
    "-vframes",
    "1",
    "-f",
    "image2",
    framePath,
  ]);

  const [buffer, dimensions] = await Promise.all([
    readFile(framePath),
    probeImageDimensions(framePath),
  ]);

  return {
    frameIndex,
    timestamp,
    filePath: framePath,
    buffer,
    contentType: getMimeTypeFromPath(framePath),
    width: dimensions.width,
    height: dimensions.height,
    detections: [] as YoloDetection[],
  } satisfies SampledFrame;
}

export function sampleObjectDetectionTimestamps(shotDuration: number) {
  const duration = Number.isFinite(shotDuration) ? Math.max(0, shotDuration) : 0;
  const timestamps = [0];

  for (let current = OBJECT_SAMPLE_INTERVAL_SECONDS; current < duration; current += 1) {
    timestamps.push(roundTime(current));
  }

  if (duration > 0 && duration - timestamps[timestamps.length - 1]! > 0.5) {
    timestamps.push(roundTime(Math.max(duration - 0.1, 0)));
  }

  return timestamps;
}

function categorizeYoloClass(yoloClass: string) {
  if (yoloClass === "person") {
    return "person";
  }

  if (
    new Set([
      "bicycle",
      "car",
      "motorcycle",
      "airplane",
      "bus",
      "train",
      "truck",
      "boat",
    ]).has(yoloClass)
  ) {
    return "vehicle";
  }

  if (
    new Set([
      "bird",
      "cat",
      "dog",
      "horse",
      "sheep",
      "cow",
      "elephant",
      "bear",
      "zebra",
      "giraffe",
    ]).has(yoloClass)
  ) {
    return "animal";
  }

  if (
    new Set([
      "chair",
      "couch",
      "bed",
      "dining_table",
      "tv",
      "laptop",
      "mouse",
      "remote",
      "keyboard",
    ]).has(yoloClass)
  ) {
    return "furniture";
  }

  if (
    new Set([
      "bottle",
      "wine_glass",
      "cup",
      "fork",
      "knife",
      "spoon",
      "bowl",
      "banana",
      "apple",
      "sandwich",
      "orange",
      "broccoli",
      "carrot",
      "hot_dog",
      "pizza",
      "donut",
      "cake",
    ]).has(yoloClass)
  ) {
    return "food";
  }

  return "object";
}

function getDisplayLabelForTrack(track: Pick<ObjectTrack, "cinematicLabel" | "yoloClass">) {
  return track.cinematicLabel || track.yoloClass || "object";
}

function buildGeminiPrompt(
  filmContext: FilmContext,
  tracks: ObjectTrack[],
  castList: string[],
) {
  const year = filmContext.year ?? "Unknown year";
  const detections = tracks
    .map((track, yoloIndex) => {
      const matchingKeyframe = track.keyframes[0];

      if (!matchingKeyframe) {
        return null;
      }

      const { x, y, w, h } = matchingKeyframe;
      const bbox = [
        roundNumber(x),
        roundNumber(y),
        roundNumber(x + w),
        roundNumber(y + h),
      ];

      return `- yolo_index: ${yoloIndex}
  class: ${track.yoloClass ?? "object"}
  confidence: ${roundNumber(track.yoloConfidence ?? track.confidence ?? 0, 3)}
  first_bbox_xyxy_normalized: [${bbox.join(", ")}]
  visible_from_seconds: ${roundTime(track.startTime)}
  visible_until_seconds: ${roundTime(track.endTime)}
  keyframe_count: ${track.keyframes.length}`;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n");

  const castSection =
    castList.length > 0
      ? `This film stars: ${castList.join(", ")}.
When you see a person, identify which character they are from this cast list. If the cast list does not support a confident identification, keep the label descriptive instead of guessing.`
      : "No verified cast list is available, so avoid inventing specific character names.";

  return `You are a film analysis expert. I'm showing you a video clip from "${filmContext.title}" (${year}) directed by ${filmContext.director}. Watch the full clip and identify tracked objects across the duration.

${castSection}

YOLO object detection found these elements:
${detections}

For each detected element, provide cinematic enrichment:
1. If it's a person — who is the character? What are they wearing, doing, and what is their emotional state?
2. If it's a vehicle — what era, make, or significance does it have in the scene?
3. If it's a prop or object — why is it cinematographically significant?
4. What is the location or setting of this scene?
5. What time of day is it based on the lighting?
6. What is the overall mood or atmosphere?
7. Track each object's identity consistently across the entire clip.

Also identify any scene-level metadata:
- Interior or exterior
- Time of day (dawn, morning, midday, afternoon, golden hour, dusk, night)
- Weather if visible
- Film era or period being depicted

If you are not confident about a specific named character, keep the cinematic_label descriptive and avoid inventing certainty.

Return ONLY valid JSON:
{
  "enrichments": [
    {
      "yolo_index": 0,
      "cinematic_label": "Michael Corleone",
      "description": "Young Michael in dark suit, walking deliberately toward the car",
      "significance": "Key character moment — the transition from civilian to mafioso",
      "attributes": {
        "character": "Michael Corleone",
        "actor": "Al Pacino",
        "clothing": "Dark wool suit, fedora",
        "action": "Walking purposefully",
        "emotion": "Determined, cold"
      }
    }
  ],
  "scene_context": {
    "location": "Desolate marshland, Long Beach, New York",
    "interior_exterior": "exterior",
    "time_of_day": "afternoon",
    "period": "1940s",
    "mood": "Tense, foreboding",
    "weather": "Clear, overcast"
  }
}`;
}

async function extractGeminiTextResponse(response: Response) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini enrichment failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text?.trim())
    .find(Boolean);

  if (!text) {
    throw new Error("Gemini enrichment response did not include text.");
  }

  return text;
}

function normalizeEnrichmentPayload(
  payload: unknown,
  trackCount: number,
) {
  const enrichments = (payload as RawEnrichmentPayload)?.enrichments;
  const rawSceneContext =
    (payload as RawEnrichmentPayload)?.scene_context ??
    (payload as RawEnrichmentPayload)?.sceneContext;

  const enrichmentsByIndex = new Map<number, Enrichment>();

  if (Array.isArray(enrichments)) {
    for (const item of enrichments) {
      const enrichment = item as RawEnrichment;
      const index = Number(enrichment.yolo_index);
      if (!Number.isInteger(index) || index < 0 || index >= trackCount) {
        continue;
      }

      enrichmentsByIndex.set(index, {
        yoloIndex: index,
        cinematicLabel: normalizeString(enrichment.cinematic_label) || null,
        description: normalizeString(enrichment.description) || null,
        significance: normalizeString(enrichment.significance) || null,
        attributes: normalizeAttributes(enrichment.attributes),
      });
    }
  }

  return {
    enrichments: Array.from(enrichmentsByIndex.values()),
    sceneContext: normalizeSceneContext(rawSceneContext),
  };
}

export async function detectWithYolo(imagePath: string): Promise<YoloDetection[]> {
  const [imageBuffer, dimensions] = await Promise.all([
    readFile(imagePath),
    probeImageDimensions(imagePath),
  ]);

  const ext = imagePath.endsWith(".png") ? "png" : "jpeg";
  const base64Image = `data:image/${ext};base64,${imageBuffer.toString("base64")}`;

  let output: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      output = await getReplicateClient().run(YOLO_REPLICATE_MODEL_REF, {
        input: {
          image: base64Image,
          query: "person . car . truck . chair . table . dog . cat . bottle . cup . knife . gun . door . window . tree . building . food . book . phone . bag . hat . plant",
          box_threshold: YOLO_CONFIDENCE_THRESHOLD,
          text_threshold: 0.2,
        },
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 12000));
        continue;
      }
      throw error;
    }
  }

  const expandedPayloads: unknown[] = [];
  await expandStructuredPayload(output, expandedPayloads);

  const candidates: Array<Record<string, unknown>> = [];
  collectDetectionCandidates(output, candidates);
  for (const payload of expandedPayloads) {
    collectDetectionCandidates(payload, candidates);
  }

  const detections = dedupeDetections(
    candidates
      .map((candidate) =>
        normalizeYoloDetection(candidate, dimensions.width, dimensions.height),
      )
      .filter((candidate): candidate is YoloDetection => candidate !== null)
      .sort((left, right) => right.confidence - left.confidence),
  );

  return detections;
}

export async function enrichWithGemini(
  videoPath: string,
  tracks: ObjectTrack[],
  filmContext: FilmContext,
): Promise<{
  enrichments: Enrichment[];
  sceneContext: ShotSceneContext | null;
}> {
  const [videoBuffer, castList] = await Promise.all([
    readFile(videoPath),
    fetchTmdbCast(filmContext.tmdbId),
  ]);
  const prompt = buildGeminiPrompt(filmContext, tracks, castList);

  await acquireToken();
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_OBJECT_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": resolveGeminiApiKey(),
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: getVideoMimeTypeFromPath(videoPath),
                  data: videoBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generation_config: {
          temperature: 0,
          response_mime_type: "application/json",
          media_resolution: "MEDIA_RESOLUTION_HIGH",
        },
      }),
    },
  );

  const text = await extractGeminiTextResponse(response);
  return normalizeEnrichmentPayload(extractJsonObject(text), tracks.length);
}

function initializeTrack(detection: YoloDetection, frame: SampledFrame, index: number) {
  const keyframe = {
    t: roundTime(frame.timestamp),
    x: detection.bbox.x,
    y: detection.bbox.y,
    w: detection.bbox.w,
    h: detection.bbox.h,
  } satisfies ShotObjectKeyframe;

  return {
    trackId: createTrackId(index),
    label: detection.class,
    category: categorizeYoloClass(detection.class),
    confidence: detection.confidence,
    yoloClass: detection.class,
    yoloConfidence: detection.confidence,
    cinematicLabel: null,
    description: null,
    significance: null,
    keyframes: [keyframe],
    startTime: keyframe.t,
    endTime: keyframe.t,
    attributes: null,
    sceneContext: null,
    bestFrameIndex: frame.frameIndex,
    lastFrameIndex: frame.frameIndex,
    lastBbox: detection.bbox,
  } satisfies MutableTrack;
}

function appendDetectionToTrack(track: MutableTrack, detection: YoloDetection, frame: SampledFrame) {
  const keyframe = {
    t: roundTime(frame.timestamp),
    x: detection.bbox.x,
    y: detection.bbox.y,
    w: detection.bbox.w,
    h: detection.bbox.h,
  } satisfies ShotObjectKeyframe;

  track.keyframes.push(keyframe);
  track.endTime = keyframe.t;
  track.lastFrameIndex = frame.frameIndex;
  track.lastBbox = detection.bbox;

  if ((track.yoloConfidence ?? 0) <= detection.confidence) {
    track.yoloConfidence = detection.confidence;
    track.confidence = detection.confidence;
    track.bestFrameIndex = frame.frameIndex;
  }
}

function trackDetections(frames: SampledFrame[]) {
  const tracks: MutableTrack[] = [];

  for (const frame of frames) {
    const detections = [...frame.detections].sort(
      (left, right) => right.confidence - left.confidence,
    );
    const matchedTrackIds = new Set<string>();

    for (const detection of detections) {
      let bestMatch: MutableTrack | null = null;
      let bestScore = 0;

      for (const track of tracks) {
        if (
          matchedTrackIds.has(track.trackId) ||
          track.yoloClass !== detection.class ||
          frame.frameIndex - track.lastFrameIndex > MATCH_FRAME_GAP
        ) {
          continue;
        }

        const score = iou(track.lastBbox, detection.bbox);
        if (score > TRACK_LINK_IOU_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestMatch = track;
        }
      }

      if (bestMatch) {
        appendDetectionToTrack(bestMatch, detection, frame);
        matchedTrackIds.add(bestMatch.trackId);
        continue;
      }

      const track = initializeTrack(detection, frame, tracks.length);
      tracks.push(track);
      matchedTrackIds.add(track.trackId);
    }
  }

  return tracks
    .map((track) => ({
      ...track,
      keyframes: [...track.keyframes].sort((left, right) => left.t - right.t),
      label: getDisplayLabelForTrack(track),
      startTime: track.keyframes[0]?.t ?? 0,
      endTime: track.keyframes.at(-1)?.t ?? 0,
    }))
    .sort(
      (left, right) =>
        left.startTime - right.startTime ||
        (right.yoloConfidence ?? 0) - (left.yoloConfidence ?? 0),
    );
}

function mergeTrackEnrichments(
  tracks: MutableTrack[],
  enrichments: Enrichment[],
  sceneContext: ShotSceneContext | null,
) {
  const enrichmentsByIndex = new Map(enrichments.map((enrichment) => [enrichment.yoloIndex, enrichment]));

  return tracks.map((track, index) => {
    const enrichment = enrichmentsByIndex.get(index);
    const cinematicLabel = enrichment?.cinematicLabel ?? null;

    return {
      ...track,
      label: cinematicLabel || track.yoloClass || track.label,
      cinematicLabel,
      description: enrichment?.description ?? null,
      significance: enrichment?.significance ?? null,
      attributes: enrichment?.attributes ?? track.attributes,
      sceneContext,
    } satisfies MutableTrack;
  });
}

async function extractFrameSet(videoPath: string, timestamps: number[]) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-object-frames-"));

  try {
    const frames: SampledFrame[] = [];

    for (const [frameIndex, timestamp] of timestamps.entries()) {
      const frame = await extractFrameImage(videoPath, timestamp, frameIndex, tempDir);
      frame.detections = await detectWithYolo(frame.filePath);
      frames.push(frame);
      // Rate limit: Replicate throttles to 6 req/min on low credit
      if (frameIndex < timestamps.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    return frames;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function detectAndEnrich(
  videoPath: string,
  shotDuration: number,
  filmContext: FilmContext,
): Promise<ObjectTrack[]> {
  const timestamps = sampleObjectDetectionTimestamps(shotDuration);
  const frames = await extractFrameSet(videoPath, timestamps);
  const rawTracks = trackDetections(frames);

  // Filter: require at least 2 keyframes and confidence > 0.35
  // Then keep only top 8 by confidence
  const tracks = rawTracks
    .filter((t) => t.keyframes.length >= 2 && (t.confidence ?? 0) > 0.35)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 8);

  if (tracks.length === 0) {
    return [];
  }

  const enrichmentPayload = await enrichWithGemini(videoPath, tracks, filmContext);

  return mergeTrackEnrichments(
    tracks,
    enrichmentPayload.enrichments,
    enrichmentPayload.sceneContext,
  );
}

function mapStoredTrack(row: typeof schema.shotObjects.$inferSelect): StoredObjectTrack {
  return {
    id: row.id,
    trackId: row.trackId,
    label: row.label,
    category: row.category ?? null,
    confidence: row.confidence ?? null,
    yoloClass: row.yoloClass ?? null,
    yoloConfidence: row.yoloConfidence ?? null,
    cinematicLabel: row.cinematicLabel ?? null,
    description: row.description ?? null,
    significance: row.significance ?? null,
    keyframes: row.keyframes ?? [],
    startTime: row.startTime ?? 0,
    endTime: row.endTime ?? 0,
    attributes: row.attributes ?? null,
    sceneContext: row.sceneContext ?? null,
  };
}

export async function fetchAssetBuffer(url: string) {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

export async function detectObjectsMultiFrame(
  videoPath: string,
  shotDuration: number,
  filmContext: FilmContext,
): Promise<ObjectTrack[]> {
  return detectAndEnrich(videoPath, shotDuration, filmContext);
}

export async function replaceShotObjects(shotId: string, tracks: ObjectTrack[]) {
  await db.delete(schema.shotObjects).where(eq(schema.shotObjects.shotId, shotId));

  if (tracks.length === 0) {
    return [];
  }

  const inserted = await db
    .insert(schema.shotObjects)
    .values(
      tracks.map((track, index) => ({
        shotId,
        trackId: track.trackId,
        label: track.cinematicLabel || track.yoloClass || track.label,
        category: track.category,
        confidence: track.yoloConfidence ?? track.confidence,
        yoloClass: track.yoloClass,
        yoloConfidence: track.yoloConfidence ?? track.confidence,
        cinematicLabel: track.cinematicLabel,
        description: track.description,
        significance: track.significance,
        keyframes: track.keyframes,
        startTime: track.startTime,
        endTime: track.endTime,
        attributes: track.attributes,
        sceneContext: index === 0 ? track.sceneContext : null,
      })),
    )
    .returning();

  return inserted.map(mapStoredTrack);
}

export async function detectObjectsFromVideo(shotId: string): Promise<StoredObjectTrack[]> {
  const [shot] = await db
    .select({
      id: schema.shots.id,
      startTc: schema.shots.startTc,
      endTc: schema.shots.endTc,
      duration: schema.shots.duration,
      videoUrl: schema.shots.videoUrl,
      filmTitle: schema.films.title,
      filmDirector: schema.films.director,
      filmYear: schema.films.year,
      filmTmdbId: schema.films.tmdbId,
    })
    .from(schema.shots)
    .innerJoin(schema.films, eq(schema.shots.filmId, schema.films.id))
    .where(eq(schema.shots.id, shotId))
    .limit(1);

  if (!shot) {
    throw new Error("Shot not found.");
  }

  if (!shot.videoUrl) {
    throw new Error("Shot does not have a video asset.");
  }

  const duration =
    shot.duration ??
    (typeof shot.startTc === "number" && typeof shot.endTc === "number"
      ? Math.max(0, shot.endTc - shot.startTc)
      : null);

  if (duration === null) {
    throw new Error("Shot duration is required for object tracking.");
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-objects-"));
  const videoPath = path.join(tempDir, "input.mp4");

  try {
    const { buffer } = await fetchAssetBuffer(shot.videoUrl);
    await writeFile(videoPath, buffer);
    const tracks = await detectAndEnrich(videoPath, duration, {
      title: shot.filmTitle,
      director: shot.filmDirector,
      year: shot.filmYear ?? null,
      tmdbId: shot.filmTmdbId ?? null,
    });

    return replaceShotObjects(shotId, tracks);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
