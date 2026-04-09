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
  resolveGeminiClassifyParallelism,
  sanitize,
  roundTime,
  parseIngestTimelineFromBody,
  clipDetectedSplitsToWindow,
  prepareIngestTimelineAnalysisMedia,
  offsetDetectedSplits,
  resolveIngestVideoToLocalPath,
  shouldStreamRemoteIngestInput,
  ingestSourceDisplayFileName,
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
import {
  forwardIngestFilmStreamToWorker,
  resolveIngestWorkerProxyTarget,
} from "@/lib/ingest-worker-delegate";
import { resetFilmIngestArtifacts } from "@/lib/ingest-reset";
import {
  completeIngestRunRecord,
  createIngestRunRecord,
  failIngestRunRecord,
  setIngestRunStage,
} from "@/lib/ingest-run-record";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Vercel **Pro/Enterprise**: up to **800s**. **Hobby** max **300s** (lower this if you downgrade or deploy fails validation).
 * Set `INGEST_WORKER_URL` or `NEXT_PUBLIC_WORKER_URL` to **proxy** ingest to the TS worker (recommended on Vercel).
 */
export const maxDuration = 800;

export async function POST(request: Request) {
  const bodyText = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if ((!body.videoPath && !body.videoUrl) || !body.filmTitle || !body.director || !body.year) {
    return new Response(JSON.stringify({ error: "Missing required fields (videoPath or videoUrl)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let timeline: { startSec?: number; endSec?: number };
  try {
    timeline = parseIngestTimelineFromBody(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid timeline fields";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ingestWorker = resolveIngestWorkerProxyTarget();
  if (ingestWorker) {
    return forwardIngestFilmStreamToWorker(ingestWorker, bodyText);
  }

  // Default on Vercel: require worker proxy. Opt out with METROVISION_DELEGATE_INGEST=0 (inline at your own risk; timeouts likely).
  if (
    process.env.VERCEL === "1" &&
    process.env.METROVISION_DELEGATE_INGEST !== "0"
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Interactive ingest on Vercel requires INGEST_WORKER_URL or NEXT_PUBLIC_WORKER_URL pointing at your TS worker origin. Serverless cannot reliably run full FFmpeg/PySceneDetect ingest (see docs/production-ingest.md). To force inline ingest on Vercel, set METROVISION_DELEGATE_INGEST=0.",
      }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  const filmTitleStr = String(body.filmTitle);
  const directorStr = String(body.director);
  const yearNum = Number(body.year);
  const concurrencyNum =
    typeof body.concurrency === "number" && Number.isFinite(body.concurrency)
      ? body.concurrency
      : 5;

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
      let ingestRunId: string | null = null;

      try {
        // Flush immediately so proxies and the browser SSE parser don’t sit idle until the first await completes.
        try {
          controller.enqueue(encoder.encode(": sse-prelude\n\n"));
        } catch {
          /* closed */
        }

        const concurrency = concurrencyNum;
        const detector: "content" | "adaptive" =
          body.detector === "content" ? "content" : "adaptive";
        const filmSlug = `${sanitize(filmTitleStr)}-${yearNum}`;

        const rawInput = String(body.videoUrl ?? body.videoPath);
        const inputIsRemote =
          rawInput.startsWith("http://") || rawInput.startsWith("https://");
        emit({
          type: "step",
          step: "detect",
          status: "active",
          message: inputIsRemote
            ? shouldStreamRemoteIngestInput()
              ? "Using your video URL directly (serverless disk is too small for a full local copy)…"
              : "Preparing source video (FFmpeg is copying from your URL to the server; large files can take several minutes)…"
            : "Opening uploaded file on the server…",
        });

        const prepStarted = Date.now();
        const prepHeartbeat = setInterval(() => {
          const sec = Math.floor((Date.now() - prepStarted) / 1000);
          emit({
            type: "step",
            step: "detect",
            status: "active",
            message: inputIsRemote
              ? `Still preparing source video (${sec}s) — download can take a long time; keep-alive for proxies…`
              : `Still opening uploaded file… (${sec}s)`,
          });
        }, 8_000);

        let sourceVideoPath: string;
        try {
          const resolved = await resolveIngestVideoToLocalPath(rawInput);
          sourceVideoPath = resolved.localPath;
          disposeSourceVideo = resolved.dispose;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Could not open or download source video";
          emit({ type: "error", message });
          return;
        } finally {
          clearInterval(prepHeartbeat);
        }

        const timelinePlan = await prepareIngestTimelineAnalysisMedia(sourceVideoPath, timeline);
        const segmentHint =
          timelinePlan.segmentFilmWindow != null
            ? ` (segment ${timelinePlan.segmentFilmWindow.absStart.toFixed(1)}–${timelinePlan.segmentFilmWindow.absEnd.toFixed(1)}s only)`
            : "";

        // Step 1: Detect shots (on segment file when timeline bounds are set)
        const detectorLabel =
          detector === "adaptive" ? "Adaptive (default, research)" : "Content (faster, hard cuts)";
        const detectMessage = shouldRunPysceneEnsemble()
          ? "PySceneDetect ensemble (adaptive + content + NMS)"
          : detectorLabel;
        const detectHint =
          process.env.VERCEL === "1"
            ? " On Vercel, set INGEST_WORKER_URL to your TS worker for reliable PySceneDetect, or FFmpeg scene mode may take many minutes on long films."
            : "";
        emit({
          type: "step",
          step: "detect",
          status: "active",
          message: `Analyzing shot boundaries${segmentHint} — ${detectMessage}.${detectHint}`,
        });
        const t0 = Date.now();
        const inlineCuts = parseInlineBoundaryCuts(body.extraBoundaryCuts);
        const detectHeartbeat = setInterval(() => {
          const sec = Math.floor((Date.now() - t0) / 1000);
          emit({
            type: "step",
            step: "detect",
            status: "active",
            message: `Still detecting${segmentHint}… ${detectMessage} (${sec}s). FFmpeg/PySceneDetect often emit no progress until done — for full movies on Vercel use INGEST_WORKER_URL (same value as NEXT_PUBLIC_WORKER_URL is fine).`,
          });
        }, 8_000);
        let rawSplits: Awaited<ReturnType<typeof detectShotsForIngest>>["splits"];
        let detectCtx: Awaited<ReturnType<typeof detectShotsForIngest>>["ctx"];
        try {
          const r = await detectShotsForIngest(
            timelinePlan.analysisPath,
            detector,
            {
              inlineExtraBoundaryCuts: inlineCuts,
              segmentFilmWindow: timelinePlan.segmentFilmWindow,
            },
          );
          rawSplits = r.splits;
          detectCtx = r.ctx;
          if (timelinePlan.splitTimeOffsetSec !== 0) {
            rawSplits = offsetDetectedSplits(rawSplits, timelinePlan.splitTimeOffsetSec);
          }
        } finally {
          clearInterval(detectHeartbeat);
          await timelinePlan.disposeSegment?.();
        }
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
        const detectSummary =
          timelinePlan.segmentFilmWindow != null
            ? `Found ${splits.length} shots in ${timelinePlan.segmentFilmWindow.absStart.toFixed(1)}–${timelinePlan.segmentFilmWindow.absEnd.toFixed(1)}s (detected on segment file only)`
            : clipped
              ? `Found ${splits.length} shots in window (${rawSplits.length} detected before clip)`
              : `Found ${splits.length} shots`;
        emit({ type: "step", step: "detect", status: "complete", message: detectSummary, duration: detectDuration });
        emit({ type: "init", totalShots: splits.length, concurrency });

        // TMDB lookup
        emit({ type: "step", step: "lookup", status: "active", message: "Looking up film metadata..." });
        const t1 = Date.now();
        const tmdbId = await searchTmdbMovieId(filmTitleStr, yearNum);
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
          const result = await extractLocally(sourceVideoPath, split, filmSlug, extractDir);
          emit({ type: "shot", step: "extract", index: split.index, total: splits.length, worker, status: "complete", duration: split.end - split.start });
          return result;
        });
        emit({ type: "step", step: "extract", status: "complete", message: `${splits.length} clips extracted`, duration: (Date.now() - t2) / 1000 });

        // Step 3: Classify with Gemini (parallel, higher concurrency)
        // Gemini 2.5 Flash supports high RPM — use up to 15 concurrent
        const classifyConcurrency = resolveGeminiClassifyParallelism(concurrency);
        emit({ type: "step", step: "classify", status: "active", message: `Classifying ${splits.length} shots (${classifyConcurrency} parallel)...` });
        const t3 = Date.now();
        const classifyResults = await processInParallel(splits, classifyConcurrency, async (split, worker) => {
          emit({ type: "shot", step: "classify", index: split.index, total: splits.length, worker, status: "start" });
          const result = await classifyShot(sourceVideoPath, split, filmTitleStr, directorStr, yearNum, castList);
          const c = result.classification;
          emit({ type: "shot", step: "classify", index: split.index, total: splits.length, worker, status: "complete", framing: c.framing, sceneTitle: c.scene_title });
          return result;
        });
        const classifications = classifyResults.map((r) => r.classification);
        emit({ type: "step", step: "classify", status: "complete", message: `${splits.length} shots classified`, duration: (Date.now() - t3) / 1000 });

        // Step 4: Group scenes
        emit({
          type: "step",
          step: "group",
          status: "active",
          message: "Resolving film record and replacing any previous ingest data…",
        });
        const t4 = Date.now();

        // Upsert film
        const [existingFilm] = await db
          .select({ id: schema.films.id })
          .from(schema.films)
          .where(eq(schema.films.title, filmTitleStr))
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
            title: filmTitleStr, director: directorStr, year: yearNum, tmdbId,
            posterUrl: tmdbDetails?.posterUrl, backdropUrl: tmdbDetails?.backdropUrl,
            overview: tmdbDetails?.overview, runtime: tmdbDetails?.runtime, genres: tmdbDetails?.genres,
          }).returning({ id: schema.films.id });
          filmId = inserted.id;
        }

        await resetFilmIngestArtifacts(db, filmId);
        ingestRunId = await createIngestRunRecord(db, filmId);
        emit({ type: "step", step: "group", status: "active", message: "Grouping shots into scenes…" });

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

        if (ingestRunId) await setIngestRunStage(db, ingestRunId, "write");
        // Step 5: Upload to S3 + Write to DB (parallel)
        emit({ type: "step", step: "write", status: "active", message: "Uploading to S3 + writing to database..." });
        const t5 = Date.now();

        // Batch S3 uploads (parallel, high concurrency)
        const uploadedAssets = await processInParallel(localAssets, Math.min(concurrency * 3, 20), async (asset) => {
          return uploadAssets(asset);
        });

        // Embeddings in parallel (high concurrency for API calls)
        const searchTexts = splits.map((split, i) =>
          [filmTitleStr, directorStr, classifications[i].framing, classifications[i].description, classifications[i].mood].filter(Boolean).join(" "),
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
            filmId,
            sceneId,
            sourceFile: ingestSourceDisplayFileName(rawInput),
            startTc: split.start,
            endTc: split.end,
            duration: durationSec,
            videoUrl,
            thumbnailUrl,
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
        if (ingestRunId) {
          await completeIngestRunRecord(db, ingestRunId, shotCount, scenePlans.length);
        }
        emit({ type: "complete", filmId, filmTitle: filmTitleStr, shotCount, sceneCount: scenePlans.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Pipeline failed";
        if (ingestRunId) {
          await failIngestRunRecord(db, ingestRunId, message).catch(() => {});
        }
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
