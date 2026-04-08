import path from "node:path";

import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { generateTextEmbedding } from "@/db/embeddings";
import {
  type ProgressEvent,
  detectShotsForIngest,
  extractLocally,
  uploadAssets,
  classifyShot,
  processInParallel,
  sanitize,
  roundTime,
  parseIngestTimelineFromBody,
  clipDetectedSplitsToWindow,
  resolveIngestVideoToLocalPath,
} from "@/lib/ingest-pipeline";
import { searchTmdbMovieId, fetchTmdbMovieDetails, fetchTmdbCast } from "@/lib/tmdb";
import { planContiguousScenesByNormalizedTitle } from "@/lib/scene-grouping";
import {
  parseInlineBoundaryCuts,
  shouldRunPysceneEnsemble,
} from "@/lib/boundary-ensemble";
import {
  buildIngestProvenance,
  initialReviewStatusForShot,
} from "@/lib/pipeline-provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Match non-stream ingest; without this Vercel defaults to ~10–60s and the pipeline dies mid extract/classify. */
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json();

  if ((!body.videoPath && !body.videoUrl) || !body.filmTitle || !body.director || !body.year) {
    return new Response(JSON.stringify({ error: "Missing required fields (videoPath or videoUrl)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let timeline: { startSec?: number; endSec?: number };
  try {
    timeline = parseIngestTimelineFromBody(body as Record<string, unknown>);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid timeline fields";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: ProgressEvent) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          // Stream may be closed
        }
      }

      let disposeSourceVideo: (() => Promise<void>) | undefined;

      try {
        const concurrency = body.concurrency ?? 5;
        const detector: "content" | "adaptive" =
          body.detector === "content" ? "content" : "adaptive";
        const filmSlug = `${sanitize(body.filmTitle)}-${body.year}`;

        const rawInput = String(body.videoUrl ?? body.videoPath);
        let videoPath: string;
        try {
          const resolved = await resolveIngestVideoToLocalPath(rawInput);
          videoPath = resolved.localPath;
          disposeSourceVideo = resolved.dispose;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not open or download source video";
          emit({ type: "error", message });
          return;
        }

        // Step 1: Detect shots
        const detectorLabel =
          detector === "adaptive" ? "Adaptive (default, research)" : "Content (faster, hard cuts)";
        const detectMessage = shouldRunPysceneEnsemble()
          ? "PySceneDetect ensemble (adaptive + content + NMS)"
          : detectorLabel;
        emit({
          type: "step",
          step: "detect",
          status: "active",
          message: `Analyzing shot boundaries — ${detectMessage}`,
        });
        const t0 = Date.now();
        const inlineCuts = parseInlineBoundaryCuts(body.extraBoundaryCuts);
        const { splits: rawSplits, ctx: detectCtx } = await detectShotsForIngest(
          videoPath,
          detector,
          inlineCuts ? { inlineExtraBoundaryCuts: inlineCuts } : undefined,
        );
        const splits = clipDetectedSplitsToWindow(rawSplits, timeline);
        if (splits.length === 0) {
          emit({
            type: "error",
            message:
              "No shots fall within the ingest timeline window. Widen the range or leave start/end empty for the full file.",
          });
          return;
        }
        const detectDuration = (Date.now() - t0) / 1000;
        const clipped =
          timeline.startSec !== undefined || timeline.endSec !== undefined;
        const detectSummary = clipped
          ? `Found ${splits.length} shots in window (${rawSplits.length} detected before clip)`
          : `Found ${splits.length} shots`;
        emit({ type: "step", step: "detect", status: "complete", message: detectSummary, duration: detectDuration });
        emit({ type: "init", totalShots: splits.length, concurrency });

        // TMDB lookup
        emit({ type: "step", step: "lookup", status: "active", message: "Looking up film metadata..." });
        const t1 = Date.now();
        const tmdbId = await searchTmdbMovieId(body.filmTitle, body.year);
        const tmdbDetails = tmdbId ? await fetchTmdbMovieDetails(tmdbId) : null;
        const castList = await fetchTmdbCast(tmdbId);
        emit({ type: "step", step: "lookup", status: "complete", message: tmdbId ? `TMDB #${tmdbId}` : "No TMDB match", duration: (Date.now() - t1) / 1000 });

        // Step 2: Extract clips locally (parallel) — deferred S3 upload
        // Use higher concurrency for extraction (FFmpeg is fast, I/O bound)
        const extractConcurrency = Math.min(concurrency * 2, 20);
        emit({ type: "step", step: "extract", status: "active", message: `Extracting ${splits.length} clips (${extractConcurrency} workers)...` });
        const t2 = Date.now();
        const { mkdtemp: mkTmp } = await import("node:fs/promises");
        const { tmpdir: getTmpDir } = await import("node:os");
        const extractDir = await mkTmp(path.join(getTmpDir(), "metrovision-extract-"));
        const localAssets = await processInParallel(splits, extractConcurrency, async (split, worker) => {
          emit({ type: "shot", step: "extract", index: split.index, total: splits.length, worker, status: "start" });
          const result = await extractLocally(videoPath, split, filmSlug, extractDir);
          emit({ type: "shot", step: "extract", index: split.index, total: splits.length, worker, status: "complete", duration: split.end - split.start });
          return result;
        });
        emit({ type: "step", step: "extract", status: "complete", message: `${splits.length} clips extracted`, duration: (Date.now() - t2) / 1000 });

        // Step 3: Classify with Gemini (parallel, higher concurrency)
        // Gemini 2.5 Flash supports high RPM — use up to 15 concurrent
        const classifyConcurrency = Math.min(concurrency * 3, 15);
        emit({ type: "step", step: "classify", status: "active", message: `Classifying ${splits.length} shots (${classifyConcurrency} workers)...` });
        const t3 = Date.now();
        const classifyResults = await processInParallel(splits, classifyConcurrency, async (split, worker) => {
          emit({ type: "shot", step: "classify", index: split.index, total: splits.length, worker, status: "start" });
          const result = await classifyShot(videoPath, split, body.filmTitle, body.director, body.year, castList);
          const c = result.classification;
          emit({ type: "shot", step: "classify", index: split.index, total: splits.length, worker, status: "complete", framing: c.framing, sceneTitle: c.scene_title });
          return result;
        });
        const classifications = classifyResults.map((r) => r.classification);
        emit({ type: "step", step: "classify", status: "complete", message: `${splits.length} shots classified`, duration: (Date.now() - t3) / 1000 });

        // Step 4: Group scenes
        emit({ type: "step", step: "group", status: "active", message: "Grouping shots into scenes..." });
        const t4 = Date.now();

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
            tmdbId, posterUrl: tmdbDetails?.posterUrl, backdropUrl: tmdbDetails?.backdropUrl,
            overview: tmdbDetails?.overview, runtime: tmdbDetails?.runtime, genres: tmdbDetails?.genres,
          }).where(eq(schema.films.id, filmId));
        } else {
          const [inserted] = await db.insert(schema.films).values({
            title: body.filmTitle, director: body.director, year: body.year, tmdbId,
            posterUrl: tmdbDetails?.posterUrl, backdropUrl: tmdbDetails?.backdropUrl,
            overview: tmdbDetails?.overview, runtime: tmdbDetails?.runtime, genres: tmdbDetails?.genres,
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

        emit({ type: "step", step: "group", status: "complete", message: `${scenePlans.length} scenes created`, duration: (Date.now() - t4) / 1000 });

        // Step 5: Upload to S3 + Write to DB (parallel)
        emit({ type: "step", step: "write", status: "active", message: "Uploading to S3 + writing to database..." });
        const t5 = Date.now();

        // Batch S3 uploads (parallel, high concurrency)
        const uploadedAssets = await processInParallel(localAssets, Math.min(concurrency * 3, 20), async (asset) => {
          return uploadAssets(asset);
        });

        // Embeddings in parallel (high concurrency for API calls)
        const searchTexts = splits.map((split, i) =>
          [body.filmTitle, body.director, classifications[i].framing, classifications[i].description, classifications[i].mood].filter(Boolean).join(" "),
        );
        const embeddings = await processInParallel(searchTexts, Math.min(concurrency * 2, 10), async (text) => {
          try { return await generateTextEmbedding(text); } catch { return null; }
        });

        // DB writes (sequential per shot for FK integrity, but each shot's inserts are batched)
        let shotCount = 0;
        for (let i = 0; i < splits.length; i++) {
          const split = splits[i];
          const asset = uploadedAssets[i];
          const classification = classifications[i];
          const clsMeta = classifyResults[i];
          const sceneId = sceneIdByShotIndex.get(i) ?? null;
          const durationSec = roundTime(split.end - split.start);
          const reviewStatus = initialReviewStatusForShot(
            durationSec,
            clsMeta.usedFallback,
          );
          const classificationSource = clsMeta.usedFallback ? "gemini_fallback" : "gemini";

          const videoUrl = `/api/s3?key=${encodeURIComponent(asset.clipKey)}`;
          const thumbnailUrl = `/api/s3?key=${encodeURIComponent(asset.thumbnailKey)}`;

          const [insertedShot] = await db.insert(schema.shots).values({
            filmId, sceneId, sourceFile: path.basename(videoPath),
            startTc: split.start, endTc: split.end, duration: durationSec,
            videoUrl, thumbnailUrl,
          }).returning({ id: schema.shots.id });

          // Batch the 3 related inserts in parallel (they only depend on shotId, not each other)
          await Promise.all([
            db.insert(schema.shotMetadata).values({
              shotId: insertedShot.id,
              framing: classification.framing as typeof schema.shotMetadata.$inferInsert.framing,
              depth: classification.depth as typeof schema.shotMetadata.$inferInsert.depth,
              blocking: classification.blocking as typeof schema.shotMetadata.$inferInsert.blocking,
              symmetry: classification.symmetry as typeof schema.shotMetadata.$inferInsert.symmetry,
              dominantLines: classification.dominant_lines as typeof schema.shotMetadata.$inferInsert.dominantLines,
              lightingDirection: classification.lighting_direction as typeof schema.shotMetadata.$inferInsert.lightingDirection,
              lightingQuality: classification.lighting_quality as typeof schema.shotMetadata.$inferInsert.lightingQuality,
              colorTemperature: classification.color_temperature as typeof schema.shotMetadata.$inferInsert.colorTemperature,
              foregroundElements:
                Array.isArray(classification.foreground_elements) && classification.foreground_elements.length > 0
                  ? classification.foreground_elements
                  : null,
              backgroundElements:
                Array.isArray(classification.background_elements) && classification.background_elements.length > 0
                  ? classification.background_elements
                  : null,
              shotSize: classification.shot_size as typeof schema.shotMetadata.$inferInsert.shotSize,
              angleVertical: classification.angle_vertical as typeof schema.shotMetadata.$inferInsert.angleVertical,
              angleHorizontal: classification.angle_horizontal as typeof schema.shotMetadata.$inferInsert.angleHorizontal,
              durationCat: classification.duration_cat as typeof schema.shotMetadata.$inferInsert.durationCat,
              classificationSource,
              reviewStatus,
            }),
            db.insert(schema.shotSemantic).values({
              shotId: insertedShot.id, description: classification.description || null,
              subjects: Array.isArray(classification.subjects) ? classification.subjects : [], mood: classification.mood || null,
              lighting: classification.lighting || null,
            }),
            ...(embeddings[i] ? [db.insert(schema.shotEmbeddings).values({
              shotId: insertedShot.id, embedding: embeddings[i]!, searchText: searchTexts[i],
            })] : []),
          ]);

          emit({ type: "shot", step: "write", index: i, total: splits.length, worker: 0, status: "complete" });
          shotCount++;
        }

        // Cleanup extract temp dir
        const { rm: rmDir } = await import("node:fs/promises");
        await rmDir(extractDir, { recursive: true, force: true }).catch(() => {});

        await db
          .update(schema.films)
          .set({
            ingestProvenance: buildIngestProvenance({
              detector: detectCtx.resolvedDetector,
              boundaryDetector: detectCtx.boundaryLabel,
            }),
          })
          .where(eq(schema.films.id, filmId));

        emit({ type: "step", step: "write", status: "complete", message: `${shotCount} shots written`, duration: (Date.now() - t5) / 1000 });
        emit({ type: "complete", filmId, filmTitle: body.filmTitle, shotCount, sceneCount: scenePlans.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Pipeline failed";
        emit({ type: "error", message });
      } finally {
        await disposeSourceVideo?.();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
