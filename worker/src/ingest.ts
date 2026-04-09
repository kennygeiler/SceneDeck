import { access, constants, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";

import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

import { db, schema } from "./db.js";
import * as ffmpegBinModule from "../../src/lib/ffmpeg-bin.js";
import * as ingestPipelineModule from "../../src/lib/ingest-pipeline.js";
import * as pipelineProvenance from "../../src/lib/pipeline-provenance.js";
import * as boundaryEnsembleModule from "../../src/lib/boundary-ensemble.js";
import * as tmdbModule from "../../src/lib/tmdb.js";
import * as openaiEmbeddingModule from "../../src/lib/openai-embedding.js";
import * as sceneGroupingModule from "../../src/lib/scene-grouping.js";
import * as ingestResetModule from "../../src/lib/ingest-reset.js";
import * as ingestRunRecordModule from "../../src/lib/ingest-run-record.js";

const ffmpegBin = (ffmpegBinModule as { default?: typeof ffmpegBinModule }).default
  ?? ffmpegBinModule;
const ingestPipeline = (ingestPipelineModule as { default?: typeof ingestPipelineModule }).default
  ?? ingestPipelineModule;
const provenance = (pipelineProvenance as { default?: typeof pipelineProvenance }).default
  ?? pipelineProvenance;
const boundaryEnsemble = (boundaryEnsembleModule as { default?: typeof boundaryEnsembleModule })
  .default ?? boundaryEnsembleModule;
const tmdb = (tmdbModule as { default?: typeof tmdbModule }).default ?? tmdbModule;
const openaiEmbedding = (openaiEmbeddingModule as { default?: typeof openaiEmbeddingModule })
  .default ?? openaiEmbeddingModule;
const sceneGrouping = (sceneGroupingModule as { default?: typeof sceneGroupingModule }).default
  ?? sceneGroupingModule;
const ingestReset = (ingestResetModule as { default?: typeof ingestResetModule }).default
  ?? ingestResetModule;
const ingestRunRecord = (ingestRunRecordModule as { default?: typeof ingestRunRecordModule })
  .default ?? ingestRunRecordModule;
const { getFfmpegPath, probeVideoDurationSec } = ffmpegBin;
const { buildIngestProvenance, initialReviewStatusForShot } = provenance;
const {
  detectShotsForIngest,
  classifyShot,
  processInParallel,
  resolveGeminiClassifyParallelism,
  extractLocally,
  uploadAssets,
  sanitize,
  roundTime,
  runCommand,
  parseIngestTimelineFromBody,
  clipDetectedSplitsToWindow,
  prepareIngestTimelineAnalysisMedia,
  offsetDetectedSplits,
  resolveIngestAbsoluteWindow,
} = ingestPipeline;
const { parseInlineBoundaryCuts, shouldRunPysceneEnsemble } = boundaryEnsemble;
const { searchTmdbMovieId, fetchTmdbMovieDetails, fetchTmdbCast } = tmdb;
const { generateTextEmbedding } = openaiEmbedding;
const { planContiguousScenesByNormalizedTitle } = sceneGrouping;
const { resetFilmIngestArtifacts } = ingestReset;
const {
  completeIngestRunRecord,
  createIngestRunRecord,
  failIngestRunRecord,
  setIngestRunStage,
} = ingestRunRecord;

async function resolveVideo(videoUrl: string): Promise<string> {
  if (!videoUrl.startsWith("http")) {
    await access(videoUrl, constants.R_OK);
    return videoUrl;
  }

  const downloadDir = path.join(tmpdir(), "metrovision-worker-downloads");
  await mkdir(downloadDir, { recursive: true });
  const localPath = path.join(downloadDir, `${Date.now()}-film.mp4`);

  const t0 = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[worker] Downloading video via HTTP stream (attempt ${attempt + 1}/2)...`);
      const res = await fetch(videoUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 280);
        throw new Error(`HTTP ${res.status} while downloading source video. ${body}`.trim());
      }
      if (!res.body) {
        throw new Error("Source video response had no body.");
      }

      await streamPipeline(
        Readable.fromWeb(res.body as any),
        createWriteStream(localPath),
      );
      console.log(
        `[worker] Download complete (HTTP stream): ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return localPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        /ECONNRESET|ETIMEDOUT|timed out|terminated|network|fetch failed|aborted/i.test(msg);
      if (!retryable || attempt === 1) {
        console.warn(
          `[worker] HTTP stream download failed (${msg}). Falling back to FFmpeg remux...`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    }
  }

  await runCommand(getFfmpegPath(), [
    "-y",
    "-threads",
    "2",
    "-i",
    videoUrl,
    "-c",
    "copy",
    localPath,
  ]);
  console.log(`[worker] Download complete (FFmpeg fallback): ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  return localPath;
}

/** True when the window is shorter than (almost) the whole probed file — worth skipping full remux for HTTP. */
function isStrictSubRangeOfProbedDuration(
  durationSec: number,
  w: { absStart: number; absEnd: number },
): boolean {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return false;
  return !(w.absStart <= 0.001 && w.absEnd >= durationSec - 0.05);
}

/**
 * Local path: validate and return. HTTP(S): full remux to disk unless timeline is a strict sub-range of probed
 * duration — then return the URL so segment extract + per-shot FFmpeg use ranged/streaming input (no full copy).
 */
async function resolveWorkerIngestSource(
  raw: string,
  timeline: { startSec?: number; endSec?: number },
): Promise<string> {
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    await access(raw, constants.R_OK);
    return raw;
  }

  let durationSec = 0;
  try {
    durationSec = await probeVideoDurationSec(raw);
  } catch {
    durationSec = 0;
  }

  let absWin: ReturnType<typeof resolveIngestAbsoluteWindow> = null;
  try {
    absWin = resolveIngestAbsoluteWindow(timeline, durationSec);
  } catch {
    absWin = null;
  }

  if (absWin != null && isStrictSubRangeOfProbedDuration(durationSec, absWin)) {
    console.log(
      "[worker] Timeline sub-range vs probed duration — skipping full-file remux; using URL for segment + seeks",
      { absStart: absWin.absStart, absEnd: absWin.absEnd, durationSec },
    );
    return raw;
  }

  return resolveVideo(raw);
}

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

  let timeline: { startSec?: number; endSec?: number };
  try {
    timeline = parseIngestTimelineFromBody(body as Record<string, unknown>);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid timeline fields";
    res.status(400).json({ error: message });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  try {
    res.write(": sse-prelude\n\n");
  } catch {
    /* client gone */
  }

  function emit(event: Record<string, unknown>) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      /* closed */
    }
  }

  let ingestRunId: string | null = null;
  try {
    const rawSource = String(body.videoUrl ?? body.videoPath ?? "");
    let sourceHost: string | null = null;
    try {
      if (rawSource.startsWith("http")) sourceHost = new URL(rawSource).host;
    } catch {
      sourceHost = null;
    }
    console.log("[worker] ingest stream start", {
      film: body.filmTitle,
      year: body.year,
      sourceHost,
      isHttp: rawSource.startsWith("http"),
    });

    const concurrency = body.concurrency ?? 5;
    const detector: "content" | "adaptive" =
      body.detector === "content" ? "content" : "adaptive";
    const filmSlug = `${sanitize(body.filmTitle)}-${body.year}`;

    emit({
      type: "step",
      step: "detect",
      status: "active",
      message: rawSource.startsWith("http")
        ? "Preparing HTTP source (probing duration; timeline ingest may skip copying the full file)…"
        : "Preparing video file…",
    });
    const prepStarted = Date.now();
    const prepHeartbeat = setInterval(() => {
      const sec = Math.floor((Date.now() - prepStarted) / 1000);
      emit({
        type: "step",
        step: "detect",
        status: "active",
        message: rawSource.startsWith("http")
          ? `Still preparing source (${sec}s) — full remux only when needed; otherwise streaming segment from URL…`
          : `Still opening video file… (${sec}s)`,
      });
    }, 8_000);
    let videoPath: string;
    try {
      videoPath = await resolveWorkerIngestSource(rawSource, timeline);
    } finally {
      clearInterval(prepHeartbeat);
    }
    console.log(`[worker] Video resolved: ${videoPath.slice(0, 120)}${videoPath.length > 120 ? "…" : ""}`);

    const sourceVideoPath = videoPath;
    const timelinePlan = await prepareIngestTimelineAnalysisMedia(sourceVideoPath, timeline);
    const segmentHint =
      timelinePlan.segmentFilmWindow != null
        ? ` (segment ${timelinePlan.segmentFilmWindow.absStart.toFixed(3)}–${timelinePlan.segmentFilmWindow.absEnd.toFixed(3)}s only)`
        : "";

    const detLabel =
      detector === "adaptive" ? "Adaptive (default, research)" : "Content (faster, hard cuts)";
    const detectLabel = shouldRunPysceneEnsemble()
      ? "PySceneDetect ensemble (adaptive + content + NMS)"
      : detLabel;
    emit({
      type: "step",
      step: "detect",
      status: "active",
      message: `Detecting shots${segmentHint} — ${detectLabel}`,
    });
    const t0 = Date.now();
    const inlineCuts = parseInlineBoundaryCuts(body.extraBoundaryCuts);
    const detectHeartbeat = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      emit({
        type: "step",
        step: "detect",
        status: "active",
        message: `Detecting shots${segmentHint} — ${detectLabel} (${sec}s elapsed; PySceneDetect has no progress bar — long films can take many minutes)`,
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
    } finally {
      clearInterval(detectHeartbeat);
      await timelinePlan.disposeSegment?.();
    }
    if (timelinePlan.splitTimeOffsetSec !== 0) {
      rawSplits = offsetDetectedSplits(rawSplits, timelinePlan.splitTimeOffsetSec);
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
    console.log(
      `[worker] Detection complete: ${splits.length} shots` +
        (timelinePlan.segmentFilmWindow != null
          ? ` (segment ${timelinePlan.segmentFilmWindow.absStart.toFixed(3)}–${timelinePlan.segmentFilmWindow.absEnd.toFixed(3)}s, ${rawSplits.length} in segment before film time remap + clip)`
          : ` (${rawSplits.length} on full source before clip)`),
    );
    const clipped =
      timeline.startSec !== undefined || timeline.endSec !== undefined;
    emit({
      type: "step",
      step: "detect",
      status: "complete",
      message:
        timelinePlan.segmentFilmWindow != null
          ? `Found ${splits.length} shots in ${timelinePlan.segmentFilmWindow.absStart.toFixed(1)}–${timelinePlan.segmentFilmWindow.absEnd.toFixed(1)}s (detected on segment file only)`
          : clipped
            ? `Found ${splits.length} shots in window (${rawSplits.length} detected before clip)`
            : `Found ${splits.length} shots`,
      duration: (Date.now() - t0) / 1000,
    });
    emit({ type: "init", totalShots: splits.length, concurrency });

    emit({ type: "step", step: "lookup", status: "active", message: "Looking up film metadata..." });
    const t1 = Date.now();
    const tmdbId = await searchTmdbMovieId(body.filmTitle, Number(body.year));
    const tmdbDetails = tmdbId ? await fetchTmdbMovieDetails(tmdbId) : null;
    const castList = await fetchTmdbCast(tmdbId);
    emit({
      type: "step",
      step: "lookup",
      status: "complete",
      message: tmdbId ? `TMDB #${tmdbId}` : "No match",
      duration: (Date.now() - t1) / 1000,
    });

    const extractConcurrency = Math.min(concurrency, 4);
    emit({
      type: "step",
      step: "extract",
      status: "active",
      message: `Extracting ${splits.length} clips (${extractConcurrency} workers)...`,
    });
    const t2 = Date.now();
    const extractDir = await mkdtemp(path.join(tmpdir(), "metrovision-extract-"));
    const localAssets = await processInParallel(
      splits,
      extractConcurrency,
      async (split, w) => {
        emit({
          type: "shot",
          step: "extract",
          index: split.index,
          total: splits.length,
          worker: w,
          status: "start",
        });
        const result = await extractLocally(sourceVideoPath, split, filmSlug, extractDir);
        emit({
          type: "shot",
          step: "extract",
          index: split.index,
          total: splits.length,
          worker: w,
          status: "complete",
        });
        return result;
      },
    );
    emit({
      type: "step",
      step: "extract",
      status: "complete",
      message: `${splits.length} clips`,
      duration: (Date.now() - t2) / 1000,
    });

    const classifyConcurrency = resolveGeminiClassifyParallelism(concurrency);
    emit({
      type: "step",
      step: "classify",
      status: "active",
      message: `Classifying ${splits.length} shots (${classifyConcurrency} parallel; set METROVISION_CLASSIFY_CONCURRENCY to raise cap)...`,
    });
    const t3 = Date.now();
    const yearNum = Number(body.year);
    const classifyResults = await processInParallel(
      splits,
      classifyConcurrency,
      async (split, w) => {
        emit({
          type: "shot",
          step: "classify",
          index: split.index,
          total: splits.length,
          worker: w,
          status: "start",
        });
        const wrapped = await classifyShot(
          sourceVideoPath,
          split,
          body.filmTitle,
          body.director,
          yearNum,
          castList,
        );
        const result = wrapped.classification;
        emit({
          type: "shot",
          step: "classify",
          index: split.index,
          total: splits.length,
          worker: w,
          status: "complete",
          framing: result.framing,
          sceneTitle: result.scene_title,
        });
        return wrapped;
      },
    );
    const classifications = classifyResults.map((r) => r.classification);
    emit({
      type: "step",
      step: "classify",
      status: "complete",
      message: `${splits.length} classified`,
      duration: (Date.now() - t3) / 1000,
    });

    emit({
      type: "step",
      step: "group",
      status: "active",
      message: "Resolving film record and replacing any previous ingest data…",
    });
    const t4 = Date.now();

    const [existingFilm] = await db
      .select({ id: schema.films.id })
      .from(schema.films)
      .where(eq(schema.films.title, body.filmTitle))
      .limit(1);

    let filmId: string;
    if (existingFilm) {
      filmId = existingFilm.id;
      await db
        .update(schema.films)
        .set({
          tmdbId,
          posterUrl: tmdbDetails?.posterUrl,
          backdropUrl: tmdbDetails?.backdropUrl,
          overview: tmdbDetails?.overview,
          runtime: tmdbDetails?.runtime,
          genres: tmdbDetails?.genres,
        })
        .where(eq(schema.films.id, filmId));
    } else {
      const [ins] = await db
        .insert(schema.films)
        .values({
          title: body.filmTitle,
          director: body.director,
          year: yearNum,
          tmdbId,
          posterUrl: tmdbDetails?.posterUrl,
          backdropUrl: tmdbDetails?.backdropUrl,
          overview: tmdbDetails?.overview,
          runtime: tmdbDetails?.runtime,
          genres: tmdbDetails?.genres,
        })
        .returning({ id: schema.films.id });
      filmId = ins.id;
    }

    await resetFilmIngestArtifacts(db, filmId);
    ingestRunId = await createIngestRunRecord(db, filmId);
    emit({
      type: "step",
      step: "group",
      status: "active",
      message: "Grouping shots into scenes…",
    });

    const scenePlans = planContiguousScenesByNormalizedTitle(classifications);
    const sceneIdByShotIndex = new Map<number, string>();
    let sceneNum = 0;
    for (const plan of scenePlans) {
      sceneNum++;
      const firstIdx = plan.shotIndices[0]!;
      const lastIdx = plan.shotIndices[plan.shotIndices.length - 1]!;
      const first = classifications[firstIdx]!;
      const [ins] = await db
        .insert(schema.scenes)
        .values({
          filmId,
          sceneNumber: sceneNum,
          title: plan.displayTitle,
          description: first.scene_description || null,
          location: first.location || null,
          interiorExterior: first.interior_exterior || null,
          timeOfDay: first.time_of_day || null,
          startTc: splits[firstIdx]!.start,
          endTc: splits[lastIdx]!.end,
          totalDuration: splits[lastIdx]!.end - splits[firstIdx]!.start,
        })
        .returning({ id: schema.scenes.id });
      for (const idx of plan.shotIndices) {
        sceneIdByShotIndex.set(idx, ins.id);
      }
    }

    emit({
      type: "step",
      step: "group",
      status: "complete",
      message: `${scenePlans.length} scenes`,
      duration: (Date.now() - t4) / 1000,
    });

    if (ingestRunId) await setIngestRunStage(db, ingestRunId, "write");
    emit({ type: "step", step: "write", status: "active", message: "Upload + database..." });
    const t5 = Date.now();

    const uploadedAssets = await processInParallel(
      localAssets,
      Math.min(concurrency * 3, 20),
      async (asset) => uploadAssets(asset),
    );

    const searchTexts = splits.map((_, i) =>
      [
        body.filmTitle,
        body.director,
        classifications[i].framing,
        classifications[i].description,
        classifications[i].mood,
      ]
        .filter(Boolean)
        .join(" "),
    );

    const embeddings = await processInParallel(
      searchTexts,
      Math.min(concurrency * 2, 10),
      async (text) => {
        try {
          return await generateTextEmbedding(text);
        } catch {
          return null;
        }
      },
    );

    let shotCount = 0;
    const basename =
      typeof body.videoPath === "string" && body.videoPath.length > 0
        ? path.basename(body.videoPath)
        : "film.mp4";

    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const asset = uploadedAssets[i];
      const cls = classifications[i];
      const clsMeta = classifyResults[i];
      const sceneId = sceneIdByShotIndex.get(i) ?? null;
      const durationSec = roundTime(split.end - split.start);
      const reviewStatus = initialReviewStatusForShot(durationSec, clsMeta.usedFallback);
      const classificationSource = clsMeta.usedFallback ? "gemini_fallback" : "gemini";

      const videoUrl = `/api/s3?key=${encodeURIComponent(asset.clipKey)}`;
      const thumbnailUrl = `/api/s3?key=${encodeURIComponent(asset.thumbnailKey)}`;

      const [shot] = await db
        .insert(schema.shots)
        .values({
          filmId,
          sceneId,
          sourceFile: basename,
          startTc: split.start,
          endTc: split.end,
          duration: durationSec,
          videoUrl,
          thumbnailUrl,
        })
        .returning({ id: schema.shots.id });

      const fg = Array.isArray(cls.foreground_elements) ? cls.foreground_elements : [];
      const bg = Array.isArray(cls.background_elements) ? cls.background_elements : [];

      await Promise.all([
        db.insert(schema.shotMetadata).values({
          shotId: shot.id,
          framing: cls.framing as typeof schema.shotMetadata.$inferInsert.framing,
          depth: cls.depth as typeof schema.shotMetadata.$inferInsert.depth,
          blocking: cls.blocking as typeof schema.shotMetadata.$inferInsert.blocking,
          symmetry: cls.symmetry as typeof schema.shotMetadata.$inferInsert.symmetry,
          dominantLines: cls.dominant_lines as typeof schema.shotMetadata.$inferInsert.dominantLines,
          lightingDirection:
            cls.lighting_direction as typeof schema.shotMetadata.$inferInsert.lightingDirection,
          lightingQuality:
            cls.lighting_quality as typeof schema.shotMetadata.$inferInsert.lightingQuality,
          colorTemperature:
            cls.color_temperature as typeof schema.shotMetadata.$inferInsert.colorTemperature,
          foregroundElements: fg.length > 0 ? fg : null,
          backgroundElements: bg.length > 0 ? bg : null,
          shotSize: cls.shot_size as typeof schema.shotMetadata.$inferInsert.shotSize,
          angleVertical: cls.angle_vertical as typeof schema.shotMetadata.$inferInsert.angleVertical,
          angleHorizontal:
            cls.angle_horizontal as typeof schema.shotMetadata.$inferInsert.angleHorizontal,
          durationCat: cls.duration_cat as typeof schema.shotMetadata.$inferInsert.durationCat,
          classificationSource,
          reviewStatus,
        }),
        db.insert(schema.shotSemantic).values({
          shotId: shot.id,
          description: cls.description || null,
          subjects: Array.isArray(cls.subjects) ? cls.subjects : [],
          mood: cls.mood || null,
          lighting: cls.lighting || null,
        }),
        ...(embeddings[i]
          ? [
              db.insert(schema.shotEmbeddings).values({
                shotId: shot.id,
                embedding: embeddings[i]!,
                searchText: searchTexts[i],
              }),
            ]
          : []),
      ]);

      emit({
        type: "shot",
        step: "write",
        index: i,
        total: splits.length,
        worker: 0,
        status: "complete",
      });
      shotCount++;
    }

    await rm(extractDir, { recursive: true, force: true }).catch(() => {});

    await db
      .update(schema.films)
      .set({
        ingestProvenance: buildIngestProvenance({
          detector: detectCtx.resolvedDetector,
          boundaryDetector: detectCtx.boundaryLabel,
        }),
      })
      .where(eq(schema.films.id, filmId));

    emit({
      type: "step",
      step: "write",
      status: "complete",
      message: `${shotCount} shots written`,
      duration: (Date.now() - t5) / 1000,
    });
    if (ingestRunId) {
      await completeIngestRunRecord(db, ingestRunId, shotCount, scenePlans.length);
    }
    emit({
      type: "complete",
      filmId,
      filmTitle: body.filmTitle,
      shotCount,
      sceneCount: scenePlans.length,
    });
  } catch (error) {
    const msg = (error as Error).message || "Pipeline failed";
    if (ingestRunId) {
      await failIngestRunRecord(db, ingestRunId, msg).catch(() => {});
    }
    emit({ type: "error", message: msg });
  } finally {
    res.end();
  }
}
