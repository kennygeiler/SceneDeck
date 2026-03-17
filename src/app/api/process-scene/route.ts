import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { buildShotSearchText, generateTextEmbedding } from "@/db/embeddings";
import type { CompoundPart } from "@/db/schema";
import type { ShotWithDetails } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SplitSource = "auto" | "detected" | "manual";

type ProcessSceneRequest = {
  videoPath?: unknown;
  filmTitle?: unknown;
  director?: unknown;
  year?: unknown;
  splits?: Array<{
    start?: unknown;
    end?: unknown;
    source?: unknown;
    confidence?: unknown;
  }>;
};

type NormalizedSplit = {
  start: number;
  end: number;
  source: SplitSource;
  confidence: number | null;
};

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
};

type ProcessedShot = {
  index: number;
  start: number;
  end: number;
  duration: number;
  clipPath: string;
  thumbnailPath: string;
  videoUrl: string;
  thumbnailUrl: string;
  classification: ClassifiedShot;
  searchText: string;
  embedding: number[];
};

function roundTime(value: number) {
  return Number(value.toFixed(3));
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function resolveBlobToken() {
  const token =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.VERCEL_BLOB_READ_WRITE_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN must be set.",
    );
  }

  return token;
}

function runProcess(command: string, args: string[], cwd = process.cwd()) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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

function parseBody(body: ProcessSceneRequest) {
  const videoPath = typeof body.videoPath === "string" ? path.resolve(body.videoPath) : "";
  const filmTitle = typeof body.filmTitle === "string" ? body.filmTitle.trim() : "";
  const director = typeof body.director === "string" ? body.director.trim() : "";
  const year = Number(body.year);

  if (!videoPath) {
    throw new Error("videoPath is required.");
  }

  if (!filmTitle) {
    throw new Error("filmTitle is required.");
  }

  if (!director) {
    throw new Error("director is required.");
  }

  if (!Number.isInteger(year) || year < 1888 || year > 2100) {
    throw new Error("year must be a valid integer.");
  }

  if (!Array.isArray(body.splits) || body.splits.length === 0) {
    throw new Error("splits must contain at least one segment.");
  }

  const normalizedSplits = body.splits
    .map((split) => {
      const start = Number(split.start);
      const end = Number(split.end);
      const source = split.source;
      const confidence =
        split.confidence === null || split.confidence === undefined
          ? null
          : Number(split.confidence);

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        (source !== "auto" && source !== "detected" && source !== "manual") ||
        (confidence !== null && !Number.isFinite(confidence))
      ) {
        return null;
      }

      return {
        start: roundTime(Math.max(0, start)),
        end: roundTime(Math.max(0, end)),
        source,
        confidence,
      } satisfies NormalizedSplit;
    })
    .filter((split): split is NormalizedSplit => split !== null)
    .sort((left, right) => left.start - right.start);

  if (normalizedSplits.length === 0) {
    throw new Error("No valid splits were provided.");
  }

  for (let index = 1; index < normalizedSplits.length; index += 1) {
    const previous = normalizedSplits[index - 1];
    const current = normalizedSplits[index];

    if (current.start < previous.end) {
      throw new Error("splits must not overlap.");
    }
  }

  return {
    videoPath,
    filmTitle,
    director,
    year,
    splits: normalizedSplits,
  };
}

async function extractClipAssets(
  videoPath: string,
  split: NormalizedSplit,
  index: number,
  outputDir: string,
) {
  const clipPath = path.join(outputDir, `shot-${String(index + 1).padStart(4, "0")}.mp4`);
  const thumbnailPath = path.join(outputDir, `shot-${String(index + 1).padStart(4, "0")}.jpg`);
  const midpoint = roundTime(split.start + (split.end - split.start) / 2);
  const duration = roundTime(split.end - split.start);

  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    split.start.toFixed(3),
    "-t",
    Math.max(duration, 0.05).toFixed(3),
    "-i",
    videoPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    clipPath,
  ]);

  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    midpoint.toFixed(3),
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    thumbnailPath,
  ]);

  return {
    clipPath,
    thumbnailPath,
    duration,
  };
}

async function classifyClip(clipPath: string) {
  const pythonBinary = process.env.SCENEDECK_PYTHON_BIN || "python3";
  const script = [
    "import contextlib",
    "import io",
    "import json",
    "from pipeline.classify import classify_shot",
    `clip_path = ${JSON.stringify(clipPath)}`,
    "buffer = io.StringIO()",
    "with contextlib.redirect_stdout(buffer):",
    "    payload = classify_shot(clip_path)",
    "print(json.dumps(payload))",
  ].join("\n");

  const { stdout } = await runProcess(pythonBinary, ["-c", script]);
  const lastLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!lastLine) {
    throw new Error("Classification did not return a JSON payload.");
  }

  return JSON.parse(lastLine) as ClassifiedShot;
}

async function uploadAsset(
  filePath: string,
  pathname: string,
  contentType: string,
  token: string,
) {
  const body = await readFile(filePath);
  const result = await put(pathname, body, {
    access: "public",
    addRandomSuffix: true,
    contentType,
    token,
  });

  return result.url;
}

function buildSearchText(film: { id: string; title: string; director: string; year: number }) {
  return (shot: ProcessedShot) => {
    const shotForEmbedding: ShotWithDetails = {
      id: "",
      film: {
        id: film.id,
        title: film.title,
        director: film.director,
        year: film.year,
        tmdbId: null,
        createdAt: null,
      },
      metadata: {
        id: null,
        shotId: null,
        movementType: shot.classification.movement_type as ShotWithDetails["metadata"]["movementType"],
        direction: shot.classification.direction as ShotWithDetails["metadata"]["direction"],
        speed: shot.classification.speed as ShotWithDetails["metadata"]["speed"],
        shotSize: shot.classification.shot_size as ShotWithDetails["metadata"]["shotSize"],
        angleVertical: shot.classification.angle_vertical as ShotWithDetails["metadata"]["angleVertical"],
        angleHorizontal: shot.classification.angle_horizontal as ShotWithDetails["metadata"]["angleHorizontal"],
        angleSpecial: shot.classification.angle_special,
        durationCategory: shot.classification.duration_cat as ShotWithDetails["metadata"]["durationCategory"],
        isCompound: shot.classification.is_compound,
        compoundParts: shot.classification.compound_parts as CompoundPart[],
        classificationSource: "gemini",
      },
      semantic: {
        id: null,
        shotId: null,
        description: shot.classification.description || null,
        subjects: [],
        mood: shot.classification.mood || null,
        lighting: shot.classification.lighting || null,
        techniqueNotes: null,
      },
      duration: shot.duration,
      sourceFile: null,
      startTc: shot.start,
      endTc: shot.end,
      videoUrl: shot.videoUrl,
      thumbnailUrl: shot.thumbnailUrl,
      createdAt: null,
    };

    return buildShotSearchText(shotForEmbedding);
  };
}

async function upsertFilm(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  filmTitle: string,
  director: string,
  year: number,
) {
  const [existingFilm] = await tx
    .select({
      id: schema.films.id,
      year: schema.films.year,
    })
    .from(schema.films)
    .where(and(eq(schema.films.title, filmTitle), eq(schema.films.director, director)))
    .limit(1);

  if (existingFilm) {
    if (existingFilm.year === null) {
      await tx
        .update(schema.films)
        .set({ year })
        .where(eq(schema.films.id, existingFilm.id));
    }

    return existingFilm.id;
  }

  const [insertedFilm] = await tx
    .insert(schema.films)
    .values({
      title: filmTitle,
      director,
      year,
    })
    .returning({ id: schema.films.id });

  return insertedFilm.id;
}

export async function POST(request: Request) {
  let tempDir: string | null = null;

  try {
    const payload = parseBody((await request.json()) as ProcessSceneRequest);
    await access(payload.videoPath, constants.R_OK);

    tempDir = await mkdtemp(path.join(tmpdir(), "scenedeck-process-"));
    const blobToken = resolveBlobToken();
    const sourceFile = path.basename(payload.videoPath);
    const filmSlug = `${sanitizePathSegment(payload.filmTitle)}-${payload.year}`;

    const extractedShots: ProcessedShot[] = [];

    for (const [index, split] of payload.splits.entries()) {
      const assets = await extractClipAssets(payload.videoPath, split, index, tempDir);
      const classification = await classifyClip(assets.clipPath);
      const shotSlug = `shot-${String(index + 1).padStart(4, "0")}`;
      const videoUrl = await uploadAsset(
        assets.clipPath,
        `films/${filmSlug}/clips/${shotSlug}.mp4`,
        "video/mp4",
        blobToken,
      );
      const thumbnailUrl = await uploadAsset(
        assets.thumbnailPath,
        `films/${filmSlug}/thumbnails/${shotSlug}.jpg`,
        "image/jpeg",
        blobToken,
      );

      extractedShots.push({
        index,
        start: split.start,
        end: split.end,
        duration: assets.duration,
        clipPath: assets.clipPath,
        thumbnailPath: assets.thumbnailPath,
        videoUrl,
        thumbnailUrl,
        classification,
        searchText: "",
        embedding: [],
      } satisfies ProcessedShot);
    }

    let filmId = "";
    const withEmbeddings = await db.transaction(async (tx) => {
      filmId = await upsertFilm(tx, payload.filmTitle, payload.director, payload.year);
      const makeSearchText = buildSearchText({
        id: filmId,
        title: payload.filmTitle,
        director: payload.director,
        year: payload.year,
      });

      const shotsWithEmbeddings: ProcessedShot[] = [];

      for (const shot of extractedShots) {
        const searchText = makeSearchText(shot);
        const embedding = await generateTextEmbedding(searchText);

        shotsWithEmbeddings.push({
          ...shot,
          searchText,
          embedding,
        });
      }

      for (const shot of shotsWithEmbeddings) {
        const [insertedShot] = await tx
          .insert(schema.shots)
          .values({
            filmId,
            sourceFile,
            startTc: shot.start,
            endTc: shot.end,
            duration: shot.duration,
            videoUrl: shot.videoUrl,
            thumbnailUrl: shot.thumbnailUrl,
          })
          .returning({ id: schema.shots.id });

        await tx.insert(schema.shotMetadata).values({
          shotId: insertedShot.id,
          movementType: shot.classification.movement_type as typeof schema.shotMetadata.$inferInsert.movementType,
          direction: shot.classification.direction as typeof schema.shotMetadata.$inferInsert.direction,
          speed: shot.classification.speed as typeof schema.shotMetadata.$inferInsert.speed,
          shotSize: shot.classification.shot_size as typeof schema.shotMetadata.$inferInsert.shotSize,
          angleVertical: shot.classification.angle_vertical as typeof schema.shotMetadata.$inferInsert.angleVertical,
          angleHorizontal: shot.classification.angle_horizontal as typeof schema.shotMetadata.$inferInsert.angleHorizontal,
          angleSpecial: shot.classification.angle_special,
          durationCat: shot.classification.duration_cat as typeof schema.shotMetadata.$inferInsert.durationCat,
          isCompound: shot.classification.is_compound,
          compoundParts: shot.classification.compound_parts as CompoundPart[],
          classificationSource: "gemini",
        });

        await tx.insert(schema.shotSemantic).values({
          shotId: insertedShot.id,
          description: shot.classification.description || null,
          subjects: [],
          mood: shot.classification.mood || null,
          lighting: shot.classification.lighting || null,
          techniqueNotes: null,
        });

        await tx.insert(schema.shotEmbeddings).values({
          shotId: insertedShot.id,
          embedding: shot.embedding,
          searchText: shot.searchText,
        });
      }

      return shotsWithEmbeddings;
    });

    return NextResponse.json({
      success: true,
      filmId,
      shotCount: withEmbeddings.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Scene processing failed. Confirm ffmpeg, Python, Gemini, Blob, OpenAI, and database access are configured.";
    const status =
      error instanceof Error &&
      (message.includes("required") ||
        message.includes("must be") ||
        message.includes("valid") ||
        message.includes("overlap"))
        ? 400
        : 500;

    console.error("Failed to process scene.", error);

    return NextResponse.json({ error: message }, { status });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
