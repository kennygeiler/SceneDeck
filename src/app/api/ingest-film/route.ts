import path from "node:path";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { generateTextEmbedding } from "@/db/embeddings";
import {
  detectShotsForIngest,
  extractAndUpload,
  classifyShot,
  processInParallel,
  sanitize,
  roundTime,
  parseIngestTimelineFromBody,
  clipDetectedSplitsToWindow,
} from "@/lib/ingest-pipeline";
import { searchTmdbMovieId, fetchTmdbMovieDetails, fetchTmdbCast } from "@/lib/tmdb";
import { planContiguousScenesByNormalizedTitle } from "@/lib/scene-grouping";
import { parseInlineBoundaryCuts } from "@/lib/boundary-ensemble";
import {
  buildIngestProvenance,
  initialReviewStatusForShot,
} from "@/lib/pipeline-provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Vercel Hobby: **300s** max (same as stream ingest). After upgrading to Pro, you can set **800** here for longer serverless runs.
 * Prefer the TS worker for production ingest.
 */
export const maxDuration = 300;

type IngestRequest = {
  videoPath: string;
  filmTitle: string;
  director: string;
  year: number;
  concurrency?: number;
  detector?: "content" | "adaptive";
  /** TransNet / human hard cuts (seconds), merged with METROVISION_EXTRA_BOUNDARY_CUTS_JSON. */
  extraBoundaryCuts?: number[];
  ingestStartSec?: number;
  ingestEndSec?: number;
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
    const detector = body.detector === "content" ? "content" : "adaptive";
    const filmSlug = `${sanitize(body.filmTitle)}-${body.year}`;
    const videoPath = path.resolve(body.videoPath);

    let timeline: { startSec?: number; endSec?: number };
    try {
      timeline = parseIngestTimelineFromBody(body as Record<string, unknown>);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid timeline fields";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const inlineCuts = parseInlineBoundaryCuts(body.extraBoundaryCuts);
    const { splits: rawSplits, ctx: detectCtx } = await detectShotsForIngest(
      videoPath,
      detector,
      inlineCuts ? { inlineExtraBoundaryCuts: inlineCuts } : undefined,
    );
    const splits = clipDetectedSplitsToWindow(rawSplits, timeline);
    if (splits.length === 0) {
      return NextResponse.json(
        {
          error:
            "No shots fall within the ingest timeline window. Widen the range or omit start/end for the full file.",
        },
        { status: 400 },
      );
    }

    // TMDB
    const tmdbId = await searchTmdbMovieId(body.filmTitle, body.year);
    const tmdbDetails = tmdbId ? await fetchTmdbMovieDetails(tmdbId) : null;
    const castList = await fetchTmdbCast(tmdbId);

    // Extract clips (parallel)
    const assets = await processInParallel(splits, concurrency, async (split) => {
      return extractAndUpload(videoPath, split, filmSlug);
    });

    const classifyResults = await processInParallel(splits, concurrency, async (split) => {
      return classifyShot(videoPath, split, body.filmTitle, body.director, body.year, castList);
    });
    const classifications = classifyResults.map((r) => r.classification);

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

    const scenePlans = planContiguousScenesByNormalizedTitle(classifications);
    const sceneIdByShotIndex = new Map<number, string>();
    let sceneNumber = 0;
    for (const plan of scenePlans) {
      sceneNumber++;
      const firstIdx = plan.shotIndices[0]!;
      const lastIdx = plan.shotIndices[plan.shotIndices.length - 1]!;
      const firstShot = classifications[firstIdx]!;
      const startTc = splits[firstIdx]!.start;
      const endTc = splits[lastIdx]!.end;
      const [inserted] = await db.insert(schema.scenes).values({
        filmId, sceneNumber, title: plan.displayTitle,
        description: firstShot.scene_description || null,
        location: firstShot.location || null,
        interiorExterior: firstShot.interior_exterior || null,
        timeOfDay: firstShot.time_of_day || null,
        startTc, endTc, totalDuration: endTc - startTc,
      }).returning({ id: schema.scenes.id });
      for (const idx of plan.shotIndices) {
        sceneIdByShotIndex.set(idx, inserted.id);
      }
    }

    // Write shots
    const searchTexts = splits.map((split, i) =>
      [body.filmTitle, body.director, classifications[i].framing, classifications[i].description, classifications[i].mood].filter(Boolean).join(" "),
    );
    const embeddings = await processInParallel(searchTexts, concurrency, async (text) => {
      try { return await generateTextEmbedding(text); } catch { return null; }
    });

    let shotCount = 0;
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const asset = assets[i];
      const classification = classifications[i];
      const clsMeta = classifyResults[i];
      const sceneId = sceneIdByShotIndex.get(i) ?? null;
      const durationSec = roundTime(split.end - split.start);
      const reviewStatus = initialReviewStatusForShot(durationSec, clsMeta.usedFallback);
      const classificationSource = clsMeta.usedFallback ? "gemini_fallback" : "gemini";
      const videoUrl = `/api/s3?key=${encodeURIComponent(asset.clipKey)}`;
      const thumbnailUrl = `/api/s3?key=${encodeURIComponent(asset.thumbnailKey)}`;

      const [insertedShot] = await db.insert(schema.shots).values({
        filmId, sceneId, sourceFile: path.basename(body.videoPath),
        startTc: split.start, endTc: split.end, duration: durationSec,
        videoUrl, thumbnailUrl,
      }).returning({ id: schema.shots.id });

      await db.insert(schema.shotMetadata).values({
        shotId: insertedShot.id,
        framing: classification.framing as typeof schema.shotMetadata.$inferInsert.framing,
        depth: classification.depth as typeof schema.shotMetadata.$inferInsert.depth,
        blocking: classification.blocking as typeof schema.shotMetadata.$inferInsert.blocking,
        symmetry: classification.symmetry as typeof schema.shotMetadata.$inferInsert.symmetry,
        dominantLines: classification.dominant_lines as typeof schema.shotMetadata.$inferInsert.dominantLines,
        lightingDirection: classification.lighting_direction as typeof schema.shotMetadata.$inferInsert.lightingDirection,
        lightingQuality: classification.lighting_quality as typeof schema.shotMetadata.$inferInsert.lightingQuality,
        colorTemperature: classification.color_temperature as typeof schema.shotMetadata.$inferInsert.colorTemperature,
        shotSize: classification.shot_size as typeof schema.shotMetadata.$inferInsert.shotSize,
        angleVertical: classification.angle_vertical as typeof schema.shotMetadata.$inferInsert.angleVertical,
        angleHorizontal: classification.angle_horizontal as typeof schema.shotMetadata.$inferInsert.angleHorizontal,
        durationCat: classification.duration_cat as typeof schema.shotMetadata.$inferInsert.durationCat,
        classificationSource,
        reviewStatus,
      });

      await db.insert(schema.shotSemantic).values({
        shotId: insertedShot.id,
        description: classification.description || null,
        subjects: Array.isArray(classification.subjects) ? classification.subjects : [],
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

    await db
      .update(schema.films)
      .set({
        ingestProvenance: buildIngestProvenance({
          detector: detectCtx.resolvedDetector,
          boundaryDetector: detectCtx.boundaryLabel,
        }),
      })
      .where(eq(schema.films.id, filmId));

    return NextResponse.json({
      success: true,
      filmId,
      filmTitle: body.filmTitle,
      shotCount,
      sceneCount: scenePlans.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
