import path from "node:path";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { generateTextEmbedding } from "@/db/embeddings";
import type { CompoundPart } from "@/db/schema";
import {
  type ClassifiedShot,
  detectShots,
  extractAndUpload,
  classifyShot,
  processInParallel,
  sanitize,
  roundTime,
} from "@/lib/ingest-pipeline";
import { buildS3Key } from "@/lib/s3";
import { searchTmdbMovieId, fetchTmdbMovieDetails, fetchTmdbCast } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type IngestRequest = {
  videoPath: string;
  filmTitle: string;
  director: string;
  year: number;
  concurrency?: number;
  detector?: "content" | "adaptive";
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IngestRequest;

    if (!body.videoPath || !body.filmTitle || !body.director || !body.year) {
      return NextResponse.json(
        { error: "videoPath, filmTitle, director, and year are required." },
        { status: 400 },
      );
    }

    const concurrency = body.concurrency ?? 5;
    const detector = body.detector ?? "content";
    const filmSlug = `${sanitize(body.filmTitle)}-${body.year}`;
    const videoPath = path.resolve(body.videoPath);

    // Detect shots
    const splits = await detectShots(videoPath, detector);

    // TMDB
    const tmdbId = await searchTmdbMovieId(body.filmTitle, body.year);
    const tmdbDetails = tmdbId ? await fetchTmdbMovieDetails(tmdbId) : null;
    const castList = await fetchTmdbCast(tmdbId);

    // Extract clips (parallel)
    const assets = await processInParallel(splits, concurrency, async (split) => {
      return extractAndUpload(videoPath, split, filmSlug);
    });

    // Classify (parallel)
    const classifications = await processInParallel(splits, concurrency, async (split) => {
      return classifyShot(videoPath, split, body.filmTitle, body.director, body.year, castList);
    });

    // Upsert film
    const [existingFilm] = await db
      .select({ id: schema.films.id })
      .from(schema.films)
      .where(eq(schema.films.title, body.filmTitle))
      .limit(1);

    let filmId: string;
    if (existingFilm) {
      filmId = existingFilm.id;
      await db.update(schema.films).set({
        tmdbId,
        posterUrl: tmdbDetails?.posterUrl,
        backdropUrl: tmdbDetails?.backdropUrl,
        overview: tmdbDetails?.overview,
        runtime: tmdbDetails?.runtime,
        genres: tmdbDetails?.genres,
      }).where(eq(schema.films.id, filmId));
    } else {
      const [inserted] = await db.insert(schema.films).values({
        title: body.filmTitle,
        director: body.director,
        year: body.year,
        tmdbId,
        posterUrl: tmdbDetails?.posterUrl,
        backdropUrl: tmdbDetails?.backdropUrl,
        overview: tmdbDetails?.overview,
        runtime: tmdbDetails?.runtime,
        genres: tmdbDetails?.genres,
      }).returning({ id: schema.films.id });
      filmId = inserted.id;
    }

    // Group scenes
    const sceneGroups = new Map<string, number[]>();
    for (let i = 0; i < classifications.length; i++) {
      const title = classifications[i].scene_title || "Untitled Scene";
      const group = sceneGroups.get(title) ?? [];
      group.push(i);
      sceneGroups.set(title, group);
    }

    const sceneIdByTitle = new Map<string, string>();
    let sceneNumber = 0;
    for (const [title, shotIndices] of sceneGroups) {
      sceneNumber++;
      const firstShot = classifications[shotIndices[0]];
      const startTc = splits[shotIndices[0]].start;
      const endTc = splits[shotIndices[shotIndices.length - 1]].end;
      const [inserted] = await db.insert(schema.scenes).values({
        filmId, sceneNumber, title,
        description: firstShot.scene_description || null,
        location: firstShot.location || null,
        interiorExterior: firstShot.interior_exterior || null,
        timeOfDay: firstShot.time_of_day || null,
        startTc, endTc, totalDuration: endTc - startTc,
      }).returning({ id: schema.scenes.id });
      sceneIdByTitle.set(title, inserted.id);
    }

    // Write shots
    const searchTexts = splits.map((split, i) =>
      [body.filmTitle, body.director, classifications[i].movement_type, classifications[i].description, classifications[i].mood].filter(Boolean).join(" "),
    );
    const embeddings = await processInParallel(searchTexts, concurrency, async (text) => {
      try { return await generateTextEmbedding(text); } catch { return null; }
    });

    let shotCount = 0;
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const asset = assets[i];
      const classification = classifications[i];
      const sceneTitle = classification.scene_title || "Untitled Scene";
      const sceneId = sceneIdByTitle.get(sceneTitle) ?? null;
      const videoUrl = `/api/s3?key=${encodeURIComponent(asset.clipKey)}`;
      const thumbnailUrl = `/api/s3?key=${encodeURIComponent(asset.thumbnailKey)}`;

      const [insertedShot] = await db.insert(schema.shots).values({
        filmId, sceneId, sourceFile: path.basename(body.videoPath),
        startTc: split.start, endTc: split.end, duration: roundTime(split.end - split.start),
        videoUrl, thumbnailUrl,
      }).returning({ id: schema.shots.id });

      await db.insert(schema.shotMetadata).values({
        shotId: insertedShot.id,
        movementType: classification.movement_type as typeof schema.shotMetadata.$inferInsert.movementType,
        direction: classification.direction as typeof schema.shotMetadata.$inferInsert.direction,
        speed: classification.speed as typeof schema.shotMetadata.$inferInsert.speed,
        shotSize: classification.shot_size as typeof schema.shotMetadata.$inferInsert.shotSize,
        angleVertical: classification.angle_vertical as typeof schema.shotMetadata.$inferInsert.angleVertical,
        angleHorizontal: classification.angle_horizontal as typeof schema.shotMetadata.$inferInsert.angleHorizontal,
        angleSpecial: classification.angle_special,
        durationCat: classification.duration_cat as typeof schema.shotMetadata.$inferInsert.durationCat,
        isCompound: classification.is_compound,
        compoundParts: classification.compound_parts as CompoundPart[],
        classificationSource: "gemini",
      });

      await db.insert(schema.shotSemantic).values({
        shotId: insertedShot.id,
        description: classification.description || null,
        subjects: classification.subjects ?? [],
        mood: classification.mood || null,
        lighting: classification.lighting || null,
      });

      if (embeddings[i]) {
        await db.insert(schema.shotEmbeddings).values({
          shotId: insertedShot.id,
          embedding: embeddings[i]!,
          searchText: searchTexts[i],
        });
      }

      shotCount++;
    }

    return NextResponse.json({
      success: true,
      filmId,
      filmTitle: body.filmTitle,
      shotCount,
      sceneCount: sceneGroups.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
