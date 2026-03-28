import { spawn } from "node:child_process";
import { access, constants, readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

import { db, schema } from "./db.js";
import { uploadToS3, buildS3Key } from "./s3.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClassifiedShot = {
  movement_type: string;
  direction: string;
  speed: string;
  shot_size: string;
  angle_vertical: string;
  angle_horizontal: string;
  angle_special: string | null;
  duration_cat: string;
  is_compound: boolean;
  compound_parts: Array<{ type: string; direction: string }>;
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

type DetectedSplit = { start: number; end: number; index: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function roundTime(t: number): number {
  return Math.round(t * 1000) / 1000;
}

async function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
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

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function processInParallel<T, R>(items: T[], concurrency: number, fn: (item: T, workerIdx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(w: number) {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], w);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, (_, i) => worker(i)));
  return results;
}

// ---------------------------------------------------------------------------
// TMDB
// ---------------------------------------------------------------------------

const TMDB_BASE = "https://api.themoviedb.org/3";

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) return null;
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

async function searchTmdbId(title: string, year: number): Promise<number | null> {
  const data = await tmdbFetch<{ results?: Array<{ id?: number; title?: string; release_date?: string }> }>("/search/movie", { query: title, year: String(year) });
  return data?.results?.find((r) => r.id)?.id ?? null;
}

async function fetchTmdbDetails(tmdbId: number) {
  const data = await tmdbFetch<{ poster_path?: string; backdrop_path?: string; overview?: string; runtime?: number; genres?: Array<{ name?: string }> }>(`/movie/${tmdbId}`);
  if (!data) return null;
  const img = "https://image.tmdb.org/t/p";
  return {
    posterUrl: data.poster_path ? `${img}/w500${data.poster_path}` : null,
    backdropUrl: data.backdrop_path ? `${img}/w1280${data.backdrop_path}` : null,
    overview: data.overview ?? null,
    runtime: data.runtime ?? null,
    genres: data.genres?.map((g) => g.name).filter((n): n is string => !!n) ?? [],
  };
}

async function fetchTmdbCast(tmdbId: number | null): Promise<string[]> {
  if (!tmdbId) return [];
  const data = await tmdbFetch<{ cast?: Array<{ name?: string; character?: string }> }>(`/movie/${tmdbId}/credits`);
  return data?.cast?.slice(0, 15).flatMap((m) => m.name ? [m.character ? `${m.name} as ${m.character}` : m.name] : []) ?? [];
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

async function resolveVideo(videoUrl: string): Promise<string> {
  // If it's a local path, verify it exists and return as-is
  if (!videoUrl.startsWith("http")) {
    await access(videoUrl, constants.R_OK);
    return videoUrl;
  }

  // For HTTP URLs: use FFmpeg to quickly remux to local file.
  // FFmpeg streams efficiently and -c copy avoids re-encoding (just remuxes).
  // This is faster than a raw download because FFmpeg manages the I/O pipeline.
  const downloadDir = path.join(tmpdir(), "metrovision-worker-downloads");
  await mkdir(downloadDir, { recursive: true });
  const localPath = path.join(downloadDir, `${Date.now()}-film.mp4`);

  console.log("[worker] Downloading video via FFmpeg remux...");
  const t0 = Date.now();
  await runCommand("ffmpeg", [
    "-y", "-threads", "2",
    "-i", videoUrl,
    "-c", "copy",
    localPath,
  ]);
  console.log(`[worker] Download complete: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return localPath;
}

async function detectShots(videoPath: string, detector: "content" | "adaptive"): Promise<DetectedSplit[]> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-detect-"));
  const csvPath = path.join(tempDir, "shots.csv");
  const bin = process.env.SCENEDETECT_PATH ?? "scenedetect";
  const detectorArgs = detector === "adaptive" ? ["detect-adaptive", "-t", "3.0"] : ["detect-content", "-t", "27.0"];

  await runCommand(bin, [
    "-i", videoPath,
    ...(detector === "content" ? ["-d", "4"] : []),
    ...detectorArgs,
    "list-scenes", "-o", tempDir, "-f", "shots", "-q",
  ]);

  const csv = await readFile(csvPath, "utf-8").catch(() => "");
  await rm(tempDir, { recursive: true, force: true });

  if (!csv.trim()) {
    const { stdout } = await runCommand("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", videoPath]);
    return [{ start: 0, end: roundTime(parseFloat(stdout.trim()) || 0), index: 0 }];
  }

  return csv.trim().split("\n").slice(2)
    .map((line, i) => {
      const cols = line.split(",");
      const start = parseFloat(cols[3]?.trim() ?? "0");
      const end = parseFloat(cols[6]?.trim() ?? "0");
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start: roundTime(start), end: roundTime(end), index: i };
    })
    .filter((s): s is DetectedSplit => s !== null);
}

async function extractAndUpload(videoPath: string, split: DetectedSplit, filmSlug: string): Promise<{ clipKey: string; thumbnailKey: string }> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-clip-"));
  const shotName = `shot-${String(split.index + 1).padStart(3, "0")}`;
  const clipFile = path.join(tempDir, `${shotName}.mp4`);
  const thumbFile = path.join(tempDir, `${shotName}.jpg`);
  const midpoint = split.start + (split.end - split.start) / 2;

  try {
    await runCommand("ffmpeg", ["-y", "-threads", "1", "-ss", String(split.start), "-to", String(split.end), "-i", videoPath, "-c", "copy", "-avoid_negative_ts", "make_zero", clipFile]);
    await runCommand("ffmpeg", ["-y", "-threads", "1", "-ss", String(midpoint), "-i", videoPath, "-frames:v", "1", "-q:v", "3", "-vf", "scale=320:trunc(ow/a/2)*2", thumbFile]);

    const [clipBuf, thumbBuf] = await Promise.all([readFile(clipFile), readFile(thumbFile)]);
    const clipKey = buildS3Key(filmSlug, "clips", `${shotName}.mp4`);
    const thumbKey = buildS3Key(filmSlug, "thumbnails", `${shotName}.jpg`);
    await Promise.all([uploadToS3(clipKey, clipBuf, "video/mp4"), uploadToS3(thumbKey, thumbBuf, "image/jpeg")]);

    return { clipKey, thumbnailKey: thumbKey };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function fallbackClassification(): ClassifiedShot {
  return {
    movement_type: "static", direction: "none", speed: "moderate", shot_size: "medium",
    angle_vertical: "eye_level", angle_horizontal: "frontal", angle_special: null,
    duration_cat: "standard", is_compound: false, compound_parts: [],
    description: "Classification unavailable", mood: "neutral", lighting: "unknown",
    subjects: [], scene_title: "Unclassified", scene_description: "", location: "unknown",
    interior_exterior: "interior", time_of_day: "day",
  };
}

async function classifyShot(videoPath: string, split: DetectedSplit, filmTitle: string, director: string, year: number, castList: string[]): Promise<ClassifiedShot> {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return fallbackClassification();

    const tempDir = await mkdtemp(path.join(tmpdir(), "metrovision-gemini-"));
    const clipFile = path.join(tempDir, "clip.mp4");
    const clipDuration = Math.min(split.end - split.start, 10);
    await runCommand("ffmpeg", ["-y", "-threads", "1", "-ss", String(split.start), "-t", String(clipDuration), "-i", videoPath, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "35", "-vf", "scale=320:trunc(ow/a/2)*2", "-r", "10", "-an", clipFile]);

    try {
      const base64Video = (await readFile(clipFile)).toString("base64");

      const prompt = `You are a cinematography analyst. Analyze this clip from "${filmTitle}" (${year}, dir. ${director}).
${castList.length > 0 ? `Known cast: ${castList.join(", ")}` : ""}
Timecode: ${formatTimecode(split.start)} - ${formatTimecode(split.end)} (${(split.end - split.start).toFixed(1)}s)

Return JSON: { "movement_type", "direction", "speed", "shot_size", "angle_vertical", "angle_horizontal", "angle_special", "duration_cat", "is_compound", "compound_parts", "description", "mood", "lighting", "subjects", "scene_title", "scene_description", "location", "interior_exterior", "time_of_day" }
Use standard cinematography taxonomy values. Return ONLY valid JSON.`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inlineData: { mimeType: "video/mp4", data: base64Video } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: "application/json" },
        }),
      });

      if (!res.ok) return fallbackClassification();

      const result = await res.json();
      const parts = result?.candidates?.[0]?.content?.parts ?? [];
      let text = parts.map((p: any) => p.text ?? "").join("\n");
      text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return fallbackClassification();
      return JSON.parse(match[0]) as ClassifiedShot;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`[classify] Shot ${split.index} failed:`, (err as Error).message);
    return fallbackClassification();
  }
}

// ---------------------------------------------------------------------------
// OpenAI embeddings
// ---------------------------------------------------------------------------

async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text, dimensions: 768 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Express handler — SSE streaming
// ---------------------------------------------------------------------------

export async function ingestFilmHandler(req: Request, res: Response) {
  const body = req.body;

  if (!body.videoPath && !body.videoUrl) {
    res.status(400).json({ error: "videoPath or videoUrl is required" });
    return;
  }
  if (!body.filmTitle || !body.director || !body.year) {
    res.status(400).json({ error: "filmTitle, director, and year are required" });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  function emit(event: Record<string, unknown>) {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* closed */ }
  }

  try {
    const concurrency = body.concurrency ?? 5;
    const detector: "content" | "adaptive" = body.detector === "adaptive" ? "adaptive" : "content";
    const filmSlug = `${sanitize(body.filmTitle)}-${body.year}`;

    // Download or resolve video
    emit({ type: "step", step: "detect", status: "active", message: "Preparing video..." });
    const videoPath = await resolveVideo(body.videoPath ?? body.videoUrl);
    console.log(`[worker] Video resolved: ${videoPath.startsWith("http") ? "streaming from URL" : "local file"}`);

    // Step 1: Detect
    const detLabel = detector === "adaptive" ? "Adaptive (thorough)" : "Content (fast)";
    console.log(`[worker] Starting detection: ${detLabel}`);
    emit({ type: "step", step: "detect", status: "active", message: `Detecting shots — ${detLabel}` });
    const t0 = Date.now();
    const splits = await detectShots(videoPath, detector);
    console.log(`[worker] Detection complete: ${splits.length} shots in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    emit({ type: "step", step: "detect", status: "complete", message: `Found ${splits.length} shots`, duration: (Date.now() - t0) / 1000 });
    emit({ type: "init", totalShots: splits.length, concurrency });

    // TMDB
    emit({ type: "step", step: "lookup", status: "active", message: "Looking up film metadata..." });
    const t1 = Date.now();
    const tmdbId = await searchTmdbId(body.filmTitle, body.year);
    const tmdbDetails = tmdbId ? await fetchTmdbDetails(tmdbId) : null;
    const castList = await fetchTmdbCast(tmdbId);
    emit({ type: "step", step: "lookup", status: "complete", message: tmdbId ? `TMDB #${tmdbId}` : "No match", duration: (Date.now() - t1) / 1000 });

    // Step 2: Extract (cap at 4 on Railway to avoid OOM with FFmpeg)
    const extractConcurrency = Math.min(concurrency, 4);
    console.log(`[worker] Extracting ${splits.length} clips (concurrency: ${extractConcurrency})`);
    emit({ type: "step", step: "extract", status: "active", message: `Extracting ${splits.length} clips (${extractConcurrency} workers)...` });
    const t2 = Date.now();
    const assets = await processInParallel(splits, extractConcurrency, async (split, w) => {
      emit({ type: "shot", step: "extract", index: split.index, total: splits.length, worker: w, status: "start" });
      const result = await extractAndUpload(videoPath, split, filmSlug);
      emit({ type: "shot", step: "extract", index: split.index, total: splits.length, worker: w, status: "complete" });
      return result;
    });
    emit({ type: "step", step: "extract", status: "complete", message: `${splits.length} clips`, duration: (Date.now() - t2) / 1000 });

    // Step 3: Classify (3x concurrency for Gemini — API bound, high RPM)
    const classifyConcurrency = Math.min(concurrency * 3, 15);
    emit({ type: "step", step: "classify", status: "active", message: `Classifying ${splits.length} shots (${classifyConcurrency} workers)...` });
    const t3 = Date.now();
    const classifications = await processInParallel(splits, classifyConcurrency, async (split, w) => {
      emit({ type: "shot", step: "classify", index: split.index, total: splits.length, worker: w, status: "start" });
      const result = await classifyShot(videoPath, split, body.filmTitle, body.director, body.year, castList);
      emit({ type: "shot", step: "classify", index: split.index, total: splits.length, worker: w, status: "complete", movementType: result.movement_type, sceneTitle: result.scene_title });
      return result;
    });
    emit({ type: "step", step: "classify", status: "complete", message: `${splits.length} classified`, duration: (Date.now() - t3) / 1000 });

    // Step 4: Group + upsert film
    emit({ type: "step", step: "group", status: "active", message: "Grouping scenes..." });
    const t4 = Date.now();

    const [existingFilm] = await db.select({ id: schema.films.id }).from(schema.films).where(eq(schema.films.title, body.filmTitle)).limit(1);
    let filmId: string;
    if (existingFilm) {
      filmId = existingFilm.id;
      await db.update(schema.films).set({ tmdbId, posterUrl: tmdbDetails?.posterUrl, backdropUrl: tmdbDetails?.backdropUrl, overview: tmdbDetails?.overview, runtime: tmdbDetails?.runtime, genres: tmdbDetails?.genres }).where(eq(schema.films.id, filmId));
    } else {
      const [ins] = await db.insert(schema.films).values({ title: body.filmTitle, director: body.director, year: body.year, tmdbId, posterUrl: tmdbDetails?.posterUrl, backdropUrl: tmdbDetails?.backdropUrl, overview: tmdbDetails?.overview, runtime: tmdbDetails?.runtime, genres: tmdbDetails?.genres }).returning({ id: schema.films.id });
      filmId = ins.id;
    }

    const sceneGroups = new Map<string, number[]>();
    for (let i = 0; i < classifications.length; i++) {
      const title = classifications[i].scene_title || "Untitled Scene";
      const g = sceneGroups.get(title) ?? [];
      g.push(i);
      sceneGroups.set(title, g);
    }

    const sceneIdByTitle = new Map<string, string>();
    let sceneNum = 0;
    for (const [title, indices] of sceneGroups) {
      sceneNum++;
      const first = classifications[indices[0]];
      const [ins] = await db.insert(schema.scenes).values({
        filmId, sceneNumber: sceneNum, title,
        description: first.scene_description || null, location: first.location || null,
        interiorExterior: first.interior_exterior || null, timeOfDay: first.time_of_day || null,
        startTc: splits[indices[0]].start, endTc: splits[indices[indices.length - 1]].end,
        totalDuration: splits[indices[indices.length - 1]].end - splits[indices[0]].start,
      }).returning({ id: schema.scenes.id });
      sceneIdByTitle.set(title, ins.id);
    }
    emit({ type: "step", step: "group", status: "complete", message: `${sceneGroups.size} scenes`, duration: (Date.now() - t4) / 1000 });

    // Step 5: Write
    emit({ type: "step", step: "write", status: "active", message: "Writing to database..." });
    const t5 = Date.now();

    const searchTexts = splits.map((s, i) => [body.filmTitle, body.director, classifications[i].movement_type, classifications[i].description, classifications[i].mood].filter(Boolean).join(" "));
    const embeddings = await processInParallel(searchTexts, concurrency, async (text) => generateEmbedding(text));

    let shotCount = 0;
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const asset = assets[i];
      const cls = classifications[i];
      const sceneId = sceneIdByTitle.get(cls.scene_title || "Untitled Scene") ?? null;
      const videoUrl = `/api/s3?key=${encodeURIComponent(asset.clipKey)}`;
      const thumbnailUrl = `/api/s3?key=${encodeURIComponent(asset.thumbnailKey)}`;

      const [shot] = await db.insert(schema.shots).values({ filmId, sceneId, sourceFile: path.basename(videoPath), startTc: split.start, endTc: split.end, duration: roundTime(split.end - split.start), videoUrl, thumbnailUrl }).returning({ id: schema.shots.id });
      await db.insert(schema.shotMetadata).values({ shotId: shot.id, movementType: cls.movement_type, direction: cls.direction, speed: cls.speed, shotSize: cls.shot_size, angleVertical: cls.angle_vertical, angleHorizontal: cls.angle_horizontal, angleSpecial: cls.angle_special, durationCat: cls.duration_cat, isCompound: cls.is_compound, compoundParts: cls.compound_parts, classificationSource: "gemini" });
      await db.insert(schema.shotSemantic).values({ shotId: shot.id, description: cls.description || null, subjects: cls.subjects ?? [], mood: cls.mood || null, lighting: cls.lighting || null });
      if (embeddings[i]) await db.insert(schema.shotEmbeddings).values({ shotId: shot.id, embedding: embeddings[i]!, searchText: searchTexts[i] });

      emit({ type: "shot", step: "write", index: i, total: splits.length, worker: 0, status: "complete" });
      shotCount++;
    }

    emit({ type: "step", step: "write", status: "complete", message: `${shotCount} shots written`, duration: (Date.now() - t5) / 1000 });
    emit({ type: "complete", filmId, filmTitle: body.filmTitle, shotCount, sceneCount: sceneGroups.size });
  } catch (error) {
    emit({ type: "error", message: (error as Error).message || "Pipeline failed" });
  } finally {
    res.end();
  }
}
