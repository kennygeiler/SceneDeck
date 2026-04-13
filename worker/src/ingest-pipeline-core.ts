import { access, constants, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db, schema } from "./db.js";
import { downloadBucketObjectToFile } from "./s3.js";
import * as ffmpegBinModule from "../../src/lib/ffmpeg-bin.js";
import * as ingestPipelineModule from "../../src/lib/ingest-pipeline.js";
import * as pipelineProvenance from "../../src/lib/pipeline-provenance.js";
import * as boundaryEnsembleModule from "../../src/lib/boundary-ensemble.js";
import * as tmdbModule from "../../src/lib/tmdb.js";
import * as openaiEmbeddingModule from "../../src/lib/openai-embedding.js";
import * as ingestResetModule from "../../src/lib/ingest-reset.js";
import * as ingestRunRecordModule from "../../src/lib/ingest-run-record.js";
import {
  parseBoundaryCutPresetConfig,
  presetConfigToDetectOptions,
} from "../../src/lib/boundary-cut-preset.js";
import { interopNamespace } from "../../src/lib/esm-interop.js";

const ffmpegBin = interopNamespace(ffmpegBinModule);
const ingestPipeline = interopNamespace(ingestPipelineModule);
const provenance = interopNamespace(pipelineProvenance);
const boundaryEnsemble = interopNamespace(boundaryEnsembleModule);
const tmdb = interopNamespace(tmdbModule);
const openaiEmbedding = interopNamespace(openaiEmbeddingModule);
const ingestReset = interopNamespace(ingestResetModule);
const ingestRunRecord = interopNamespace(ingestRunRecordModule);
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
  beginClassificationDiagBatch,
} = ingestPipeline;
const {
  parseInlineBoundaryCuts,
  shouldRunPysceneEnsembleForMode,
  mergeBoundaryCutSources,
} = boundaryEnsemble;
const { searchTmdbMovieId, fetchTmdbMovieDetails, fetchTmdbCast } = tmdb;
const { generateTextEmbedding } = openaiEmbedding;
const { resetFilmIngestArtifacts } = ingestReset;
const {
  completeIngestRunRecord,
  createIngestRunRecord,
  setIngestRunStage,
} = ingestRunRecord;

export type WorkerIngestRunContext = { ingestRunId: string | null };

export type WorkerIngestProgressSnapshot = {
  stage: string;
  message?: string;
  totalShots?: number;
  extractDone?: number;
  classifyDone?: number;
  writeDone?: number;
};

/** Virtual-hosted–style URLs: `https://bucket.s3.region.amazonaws.com/key?...` */
function tryParseS3VirtualHostedObjectUrl(
  videoUrl: string,
): { bucket: string; key: string } | null {
  try {
    const u = new URL(videoUrl);
    const m = /^([^.]+)\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i.exec(u.hostname);
    if (!m) return null;
    const bucket = m[1];
    let key = u.pathname.replace(/^\/+/, "");
    try {
      key = decodeURIComponent(key);
    } catch {
      /* keep encoded path */
    }
    if (!key) return null;
    return { bucket, key };
  } catch {
    return null;
  }
}

function sourceDownloadTimeoutMs(): number {
  const raw = process.env.METROVISION_SOURCE_DOWNLOAD_TIMEOUT_MS?.trim();
  if (raw === undefined || raw === "") return 3_600_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 3_600_000;
  if (n === 0) return 0;
  return Math.min(Math.floor(n), 12 * 3_600_000);
}

async function resolveVideo(videoUrl: string): Promise<string> {
  if (!videoUrl.startsWith("http")) {
    await access(videoUrl, constants.R_OK);
    return videoUrl;
  }

  const downloadDir = path.join(tmpdir(), "metrovision-worker-downloads");
  await mkdir(downloadDir, { recursive: true });
  const localPath = path.join(downloadDir, `${Date.now()}-film.mp4`);

  const t0 = Date.now();
  const envBucket = process.env.AWS_S3_BUCKET?.trim() ?? "";
  const parsedS3 = tryParseS3VirtualHostedObjectUrl(videoUrl);
  if (parsedS3 && envBucket && parsedS3.bucket === envBucket) {
    try {
      console.log(
        `[worker] Downloading source via S3 GetObject (${parsedS3.key.slice(0, 80)}${parsedS3.key.length > 80 ? "…" : ""})…`,
      );
      await downloadBucketObjectToFile(parsedS3.key, localPath);
      console.log(
        `[worker] Download complete (S3 GetObject): ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      return localPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[worker] S3 GetObject download failed (${msg}); falling back to HTTP stream…`,
      );
    }
  }

  const timeoutMs = sourceDownloadTimeoutMs();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[worker] Downloading video via HTTP stream (attempt ${attempt + 1}/3)…`);
      const res = await fetch(videoUrl, {
        redirect: "follow",
        ...(timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
      });
      if (!res.ok) {
        const errBody = (await res.text().catch(() => "")).slice(0, 280);
        throw new Error(`HTTP ${res.status} while downloading source video. ${errBody}`.trim());
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
        /ECONNRESET|ETIMEDOUT|timed out|terminated|network|fetch failed|aborted|operation was aborted/i.test(
          msg,
        );
      if (!retryable || attempt === 2) {
        console.warn(
          `[worker] HTTP stream download failed (${msg}). Falling back to FFmpeg remux…`,
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

function isStrictSubRangeOfProbedDuration(
  durationSec: number,
  w: { absStart: number; absEnd: number },
): boolean {
  if (!(durationSec > 0) || !Number.isFinite(durationSec)) return false;
  return !(w.absStart <= 0.001 && w.absEnd >= durationSec - 0.05);
}

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

const MAX_RECLASSIFY_SHOTS = 300;

function normalizeReclassifyShotIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (uuidRe.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

/**
 * Re-extract + Gemini classify + DB update for existing shots only (no boundary detect, no film reset).
 */
async function runWorkerReclassifyShotsPipeline(
  params: { filmId: string; shotIds: string[]; body: Record<string, unknown> },
  emit: (e: Record<string, unknown>) => void,
  ctx: WorkerIngestRunContext,
  onProgress?: (p: WorkerIngestProgressSnapshot) => void | Promise<void>,
): Promise<{ filmId: string; filmTitle: string; shotCount: number; sceneCount: number }> {
  const { filmId, shotIds, body } = params;
  ctx.ingestRunId = null;

  if (shotIds.length > MAX_RECLASSIFY_SHOTS) {
    throw new Error(
      `reclassifyShotIds exceeds max (${MAX_RECLASSIFY_SHOTS}). Split into multiple runs.`,
    );
  }

  const pushProgress = async (p: WorkerIngestProgressSnapshot) => {
    if (onProgress) await onProgress(p);
  };

  const concurrency =
    typeof body.concurrency === "number" && Number.isFinite(body.concurrency) ? body.concurrency : 5;

  const [filmRow] = await db
    .select()
    .from(schema.films)
    .where(eq(schema.films.id, filmId))
    .limit(1);
  if (!filmRow) {
    throw new Error("Film not found for selective reclassify.");
  }

  const filmTitleStr = filmRow.title;
  const directorStr = filmRow.director;
  const bodyYearRaw = body.year;
  const bodyYear =
    typeof bodyYearRaw === "number"
      ? bodyYearRaw
      : typeof bodyYearRaw === "string"
        ? Number(bodyYearRaw.trim())
        : NaN;
  const yearNum =
    Number.isFinite(bodyYear) && bodyYear > 0
      ? Math.trunc(bodyYear)
      : filmRow.year != null && Number.isFinite(filmRow.year)
        ? Math.trunc(filmRow.year)
        : 0;

  const shotRows = await db
    .select({
      id: schema.shots.id,
      startTc: schema.shots.startTc,
      endTc: schema.shots.endTc,
    })
    .from(schema.shots)
    .where(and(eq(schema.shots.filmId, filmId), inArray(schema.shots.id, shotIds)))
    .orderBy(asc(schema.shots.startTc));

  if (shotRows.length !== shotIds.length) {
    throw new Error(
      `Some shot ids are missing or not in this film (requested ${shotIds.length}, matched ${shotRows.length}).`,
    );
  }

  for (const r of shotRows) {
    if (
      typeof r.startTc !== "number" ||
      !Number.isFinite(r.startTc) ||
      typeof r.endTc !== "number" ||
      !Number.isFinite(r.endTc) ||
      r.endTc <= r.startTc
    ) {
      throw new Error(`Shot ${r.id} has invalid start_tc/end_tc for reclassify.`);
    }
  }

  const rawSource = String(body.videoUrl ?? body.videoPath ?? "");
  console.log("[worker] selective reclassify", {
    filmId,
    shots: shotRows.length,
    sourceHost: rawSource.startsWith("http")
      ? (() => {
          try {
            return new URL(rawSource).host;
          } catch {
            return null;
          }
        })()
      : null,
  });

  emit({
    type: "step",
    step: "detect",
    status: "active",
    message: rawSource.startsWith("http")
      ? `Selective reclassify: preparing HTTP source (full file; ${shotRows.length} shot(s); boundary detection skipped)…`
      : `Selective reclassify: opening source video (${shotRows.length} shot(s); boundary detection skipped)…`,
  });
  const prepStarted = Date.now();
  const prepHeartbeat = setInterval(() => {
    const sec = Math.floor((Date.now() - prepStarted) / 1000);
    emit({
      type: "step",
      step: "detect",
      status: "active",
      message: rawSource.startsWith("http")
        ? `Still preparing source (${sec}s)…`
        : `Still opening video… (${sec}s)`,
    });
  }, 8_000);
  let sourceVideoPath: string;
  try {
    sourceVideoPath = await resolveWorkerIngestSource(rawSource, {});
  } finally {
    clearInterval(prepHeartbeat);
  }

  emit({
    type: "step",
    step: "detect",
    status: "complete",
    message: `Source ready — skipped boundary detection (${shotRows.length} shot reclassify target(s))`,
    duration: (Date.now() - prepStarted) / 1000,
  });
  await pushProgress({
    stage: "detect",
    message: "Source ready",
    totalShots: shotRows.length,
  });

  emit({ type: "init", totalShots: shotRows.length, concurrency });

  emit({ type: "step", step: "lookup", status: "active", message: "Loading cast context for classification…" });
  const t1 = Date.now();
  const castList = filmRow.tmdbId ? await fetchTmdbCast(filmRow.tmdbId) : [];
  emit({
    type: "step",
    step: "lookup",
    status: "complete",
    message: castList.length ? `Cast context (${castList.length})` : "No TMDB cast",
    duration: (Date.now() - t1) / 1000,
  });
  await pushProgress({
    stage: "lookup",
    message: "Lookup complete",
    totalShots: shotRows.length,
  });

  const filmSlug = `${sanitize(filmTitleStr)}-${yearNum}`;
  const splits = shotRows.map((r, index) => ({
    shotId: r.id,
    split: { start: r.startTc as number, end: r.endTc as number, index },
  }));

  const extractConcurrency = Math.min(concurrency, 4);
  emit({
    type: "step",
    step: "extract",
    status: "active",
    message: `Extracting ${splits.length} clips (${extractConcurrency} workers)…`,
  });
  await pushProgress({
    stage: "extract",
    message: `Extracting ${splits.length} clips…`,
    totalShots: splits.length,
    extractDone: 0,
  });

  const extractDir = await mkdtemp(path.join(tmpdir(), "metrovision-reclass-extract-"));
  let extractDone = 0;
  const t2 = Date.now();
  const localAssets = await processInParallel(
    splits,
    extractConcurrency,
    async ({ shotId, split }, w) => {
      emit({
        type: "shot",
        step: "extract",
        index: split.index,
        total: splits.length,
        worker: w,
        status: "start",
      });
      const result = await extractLocally(sourceVideoPath, split, filmSlug, extractDir, {
        assetBaseName: `reclass-${shotId}`,
      });
      emit({
        type: "shot",
        step: "extract",
        index: split.index,
        total: splits.length,
        worker: w,
        status: "complete",
      });
      extractDone++;
      if (extractDone % 12 === 0 || extractDone === splits.length) {
        await pushProgress({
          stage: "extract",
          message: `Extract ${extractDone}/${splits.length}`,
          totalShots: splits.length,
          extractDone,
        });
      }
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
  await pushProgress({
    stage: "extract",
    message: `${splits.length} clips extracted`,
    totalShots: splits.length,
    extractDone: splits.length,
  });

  const classifyConcurrency = resolveGeminiClassifyParallelism(concurrency);
  beginClassificationDiagBatch();
  emit({
    type: "step",
    step: "classify",
    status: "active",
    message: `Classifying ${splits.length} shots (${classifyConcurrency} parallel)…`,
  });
  await pushProgress({
    stage: "classify",
    message: `Classifying ${splits.length} shots…`,
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: 0,
  });

  const t3 = Date.now();
  let classifyDone = 0;
  const classifyResults = await processInParallel(
    splits,
    classifyConcurrency,
    async ({ split }, w) => {
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
        filmTitleStr,
        directorStr,
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
      });
      classifyDone++;
      if (classifyDone % 10 === 0 || classifyDone === splits.length) {
        await pushProgress({
          stage: "classify",
          message: `Classify ${classifyDone}/${splits.length}`,
          totalShots: splits.length,
          extractDone: splits.length,
          classifyDone,
        });
      }
      return wrapped;
    },
  );

  emit({
    type: "step",
    step: "classify",
    status: "complete",
    message: `${splits.length} classified`,
    duration: (Date.now() - t3) / 1000,
  });
  await pushProgress({
    stage: "classify",
    message: `${splits.length} classified`,
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
  });

  emit({
    type: "step",
    step: "group",
    status: "active",
    message: "Updating existing shot rows (no full film reset)…",
  });
  emit({
    type: "step",
    step: "group",
    status: "complete",
    message: "Ready to write",
    duration: 0,
  });
  await pushProgress({
    stage: "group",
    message: "Updating shots",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
  });

  emit({ type: "step", step: "write", status: "active", message: "Upload + database…" });
  await pushProgress({
    stage: "write",
    message: "Upload + database…",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
    writeDone: 0,
  });

  const t5 = Date.now();
  const uploadedAssets = await processInParallel(
    localAssets,
    Math.min(concurrency * 3, 20),
    async (asset) => uploadAssets(asset),
  );

  const classifications = classifyResults.map((r) => r.classification);
  const searchTexts = splits.map((_, i) =>
    [filmTitleStr, directorStr, classifications[i].framing, classifications[i].description, classifications[i].mood]
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

  let writeDone = 0;
  for (let i = 0; i < splits.length; i++) {
    const { shotId, split } = splits[i]!;
    const asset = uploadedAssets[i]!;
    const cls = classifications[i]!;
    const clsMeta = classifyResults[i]!;
    const durationSec = roundTime(split.end - split.start);
    const reviewStatus = initialReviewStatusForShot(durationSec, clsMeta.usedFallback);
    const classificationSource = clsMeta.usedFallback ? "gemini_fallback" : "gemini";

    const videoUrl = `/api/s3?key=${encodeURIComponent(asset.clipKey)}`;
    const thumbnailUrl = `/api/s3?key=${encodeURIComponent(asset.thumbnailKey)}`;

    const fg = Array.isArray(cls.foreground_elements) ? cls.foreground_elements : [];
    const bg = Array.isArray(cls.background_elements) ? cls.background_elements : [];

    await db
      .update(schema.shots)
      .set({
        videoUrl,
        thumbnailUrl,
        duration: durationSec,
      })
      .where(eq(schema.shots.id, shotId));

    await db
      .update(schema.shotMetadata)
      .set({
        framing: cls.framing as typeof schema.shotMetadata.$inferInsert.framing,
        depth: cls.depth as typeof schema.shotMetadata.$inferInsert.depth,
        blocking: cls.blocking as typeof schema.shotMetadata.$inferInsert.blocking,
        symmetry: cls.symmetry as typeof schema.shotMetadata.$inferInsert.symmetry,
        dominantLines: cls.dominant_lines as typeof schema.shotMetadata.$inferInsert.dominantLines,
        lightingDirection:
          cls.lighting_direction as typeof schema.shotMetadata.$inferInsert.lightingDirection,
        lightingQuality: cls.lighting_quality as typeof schema.shotMetadata.$inferInsert.lightingQuality,
        colorTemperature: cls.color_temperature as typeof schema.shotMetadata.$inferInsert.colorTemperature,
        foregroundElements: fg.length > 0 ? fg : null,
        backgroundElements: bg.length > 0 ? bg : null,
        shotSize: cls.shot_size as typeof schema.shotMetadata.$inferInsert.shotSize,
        angleVertical: cls.angle_vertical as typeof schema.shotMetadata.$inferInsert.angleVertical,
        angleHorizontal: cls.angle_horizontal as typeof schema.shotMetadata.$inferInsert.angleHorizontal,
        durationCat: cls.duration_cat as typeof schema.shotMetadata.$inferInsert.durationCat,
        classificationSource,
        reviewStatus,
        confidence: cls.confidence ?? 0.3,
      })
      .where(eq(schema.shotMetadata.shotId, shotId));

    await db
      .update(schema.shotSemantic)
      .set({
        description: cls.description || null,
        subjects: Array.isArray(cls.subjects) ? cls.subjects : [],
        mood: cls.mood || null,
        lighting: cls.lighting || null,
      })
      .where(eq(schema.shotSemantic.shotId, shotId));

    await db.delete(schema.shotEmbeddings).where(eq(schema.shotEmbeddings.shotId, shotId));
    if (embeddings[i]) {
      await db.insert(schema.shotEmbeddings).values({
        shotId,
        embedding: embeddings[i]!,
        searchText: searchTexts[i],
      });
    }

    emit({
      type: "shot",
      step: "write",
      index: i,
      total: splits.length,
      worker: 0,
      status: "complete",
    });
    writeDone++;
    if (writeDone % 15 === 0 || writeDone === splits.length) {
      await pushProgress({
        stage: "write",
        message: `Write ${writeDone}/${splits.length}`,
        totalShots: splits.length,
        extractDone: splits.length,
        classifyDone: splits.length,
        writeDone,
      });
    }
  }

  await rm(extractDir, { recursive: true, force: true }).catch(() => {});

  emit({
    type: "step",
    step: "write",
    status: "complete",
    message: `${writeDone} shots updated`,
    duration: (Date.now() - t5) / 1000,
  });

  emit({
    type: "complete",
    filmId,
    filmTitle: filmTitleStr,
    shotCount: writeDone,
    sceneCount: 0,
  });
  await pushProgress({
    stage: "complete",
    message: "Selective reclassify done",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
    writeDone,
  });

  return {
    filmId,
    filmTitle: filmTitleStr,
    shotCount: writeDone,
    sceneCount: 0,
  };
}

/**
 * Full worker ingest pipeline (shared by SSE stream and async job runner).
 * Emits SSE-shaped events via `emit`. Updates `ctx.ingestRunId` after the film row exists.
 */
export async function runWorkerIngestFilmPipeline(
  body: Record<string, unknown>,
  emit: (e: Record<string, unknown>) => void,
  ctx: WorkerIngestRunContext,
  onProgress?: (p: WorkerIngestProgressSnapshot) => void | Promise<void>,
): Promise<{ filmId: string; filmTitle: string; shotCount: number; sceneCount: number }> {
  const reclassifyShotIds = normalizeReclassifyShotIds(body.reclassifyShotIds);
  if (reclassifyShotIds.length > 0) {
    const filmIdRaw = body.filmId;
    if (typeof filmIdRaw !== "string" || !filmIdRaw.trim()) {
      throw new Error("filmId is required when reclassifyShotIds is set.");
    }
    return runWorkerReclassifyShotsPipeline(
      { filmId: filmIdRaw.trim(), shotIds: reclassifyShotIds, body },
      emit,
      ctx,
      onProgress,
    );
  }

  const filmTitleStr = String(body.filmTitle ?? "");
  const directorStr = String(body.director ?? "");
  const yearNum = Number(body.year);
  const concurrency =
    typeof body.concurrency === "number" && Number.isFinite(body.concurrency) ? body.concurrency : 5;

  const timeline = parseIngestTimelineFromBody(body);

  const pushProgress = async (p: WorkerIngestProgressSnapshot) => {
    if (onProgress) await onProgress(p);
  };

  const rawSource = String(body.videoUrl ?? body.videoPath ?? "");
  let sourceHost: string | null = null;
  try {
    if (rawSource.startsWith("http")) sourceHost = new URL(rawSource).host;
  } catch {
    sourceHost = null;
  }
  console.log("[worker] ingest pipeline start", {
    film: filmTitleStr,
    year: body.year,
    sourceHost,
    isHttp: rawSource.startsWith("http"),
  });

  const detector: "content" | "adaptive" =
    body.detector === "content" ? "content" : "adaptive";
  const filmSlug = `${sanitize(filmTitleStr)}-${yearNum}`;

  emit({
    type: "step",
    step: "detect",
    status: "active",
    message: rawSource.startsWith("http")
      ? "Preparing HTTP source (probing duration; timeline ingest may skip copying the full file)…"
      : "Preparing video file…",
  });
  await pushProgress({
    stage: "detect",
    message: rawSource.startsWith("http") ? "Preparing HTTP source…" : "Preparing video file…",
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

  let presetCfg: ReturnType<typeof parseBoundaryCutPresetConfig> | null = null;
  let presetDetectOpts: Parameters<typeof detectShotsForIngest>[2] = {};
  const bodyPresetIdRaw = body.boundaryCutPresetId ?? body.boundaryPresetId;
  const bodyPresetId = typeof bodyPresetIdRaw === "string" ? bodyPresetIdRaw.trim() : "";
  const yearNumForPreset = yearNum;

  if (bodyPresetId) {
    const [p] = await db
      .select()
      .from(schema.boundaryCutPresets)
      .where(eq(schema.boundaryCutPresets.id, bodyPresetId))
      .limit(1);
    if (p?.config) {
      presetCfg = parseBoundaryCutPresetConfig(p.config);
      const po = presetConfigToDetectOptions(presetCfg);
      presetDetectOpts = {
        boundaryFusionPolicy: po.boundaryFusionPolicy,
        boundaryOverrides: po.boundaryOverrides,
        inlineExtraBoundaryCuts: po.inlineExtraBoundaryCuts,
      };
    }
  } else if (Number.isFinite(yearNumForPreset)) {
    const [filmRow] = await db
      .select({ boundaryCutPresetId: schema.films.boundaryCutPresetId })
      .from(schema.films)
      .where(
        and(
          eq(schema.films.title, filmTitleStr),
          eq(schema.films.director, directorStr),
          eq(schema.films.year, yearNumForPreset),
        ),
      )
      .limit(1);
    if (filmRow?.boundaryCutPresetId) {
      const [p] = await db
        .select()
        .from(schema.boundaryCutPresets)
        .where(eq(schema.boundaryCutPresets.id, filmRow.boundaryCutPresetId))
        .limit(1);
      if (p?.config) {
        presetCfg = parseBoundaryCutPresetConfig(p.config);
        const po = presetConfigToDetectOptions(presetCfg);
        presetDetectOpts = {
          boundaryFusionPolicy: po.boundaryFusionPolicy,
          boundaryOverrides: po.boundaryOverrides,
          inlineExtraBoundaryCuts: po.inlineExtraBoundaryCuts,
        };
      }
    }
  }

  const inlineCuts = parseInlineBoundaryCuts(body.extraBoundaryCuts);
  const mergedInline = mergeBoundaryCutSources(
    presetDetectOpts.inlineExtraBoundaryCuts ?? [],
    inlineCuts,
  );
  const detectOptions: Parameters<typeof detectShotsForIngest>[2] = {
    ...presetDetectOpts,
    inlineExtraBoundaryCuts: mergedInline.length > 0 ? mergedInline : undefined,
    segmentFilmWindow: timelinePlan.segmentFilmWindow,
  };

  const effectiveDetector: "content" | "adaptive" = presetCfg?.detector ?? detector;

  const modeForUi =
    presetDetectOpts.boundaryOverrides?.boundaryDetector ??
    process.env.METROVISION_BOUNDARY_DETECTOR ??
    "pyscenedetect_cli";
  const detectLabel = shouldRunPysceneEnsembleForMode(String(modeForUi))
    ? "PySceneDetect ensemble (adaptive + content + NMS)"
    : detLabel;

  emit({
    type: "step",
    step: "detect",
    status: "active",
    message: `Detecting shots${segmentHint} — ${detectLabel}`,
  });
  await pushProgress({ stage: "detect", message: `Detecting shots${segmentHint} — ${detectLabel}` });

  const t0 = Date.now();
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
      effectiveDetector,
      detectOptions,
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
    throw new Error(
      "No shots fall within the ingest timeline window. Widen the range or leave start/end empty for the full file.",
    );
  }
  console.log(
    `[worker] Detection complete: ${splits.length} shots` +
      (timelinePlan.segmentFilmWindow != null
        ? ` (segment ${timelinePlan.segmentFilmWindow.absStart.toFixed(3)}–${timelinePlan.segmentFilmWindow.absEnd.toFixed(3)}s, ${rawSplits.length} in segment before film time remap + clip)`
        : ` (${rawSplits.length} on full source before clip)`),
  );
  const clipped = timeline.startSec !== undefined || timeline.endSec !== undefined;
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
  await pushProgress({
    stage: "detect",
    message: `Found ${splits.length} shots`,
    totalShots: splits.length,
  });

  emit({ type: "step", step: "lookup", status: "active", message: "Looking up film metadata..." });
  await pushProgress({ stage: "lookup", message: "TMDB lookup…" });
  const t1 = Date.now();
  const tmdbId = await searchTmdbMovieId(filmTitleStr, yearNum);
  const tmdbDetails = tmdbId ? await fetchTmdbMovieDetails(tmdbId) : null;
  const castList = await fetchTmdbCast(tmdbId);
  emit({
    type: "step",
    step: "lookup",
    status: "complete",
    message: tmdbId ? `TMDB #${tmdbId}` : "No match",
    duration: (Date.now() - t1) / 1000,
  });
  await pushProgress({
    stage: "lookup",
    message: tmdbId ? `TMDB #${tmdbId}` : "No match",
    totalShots: splits.length,
  });

  const extractConcurrency = Math.min(concurrency, 4);
  emit({
    type: "step",
    step: "extract",
    status: "active",
    message: `Extracting ${splits.length} clips (${extractConcurrency} workers)...`,
  });
  await pushProgress({
    stage: "extract",
    message: `Extracting ${splits.length} clips…`,
    totalShots: splits.length,
    extractDone: 0,
  });

  const t2 = Date.now();
  const extractDir = await mkdtemp(path.join(tmpdir(), "metrovision-extract-"));
  let extractDone = 0;
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
      extractDone++;
      if (extractDone % 12 === 0 || extractDone === splits.length) {
        await pushProgress({
          stage: "extract",
          message: `Extract ${extractDone}/${splits.length}`,
          totalShots: splits.length,
          extractDone,
        });
      }
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
  await pushProgress({
    stage: "extract",
    message: `${splits.length} clips extracted`,
    totalShots: splits.length,
    extractDone: splits.length,
  });

  const classifyConcurrency = resolveGeminiClassifyParallelism(concurrency);
  beginClassificationDiagBatch();
  emit({
    type: "step",
    step: "classify",
    status: "active",
    message: `Classifying ${splits.length} shots (${classifyConcurrency} parallel; set METROVISION_CLASSIFY_CONCURRENCY to raise cap)...`,
  });
  await pushProgress({
    stage: "classify",
    message: `Classifying ${splits.length} shots…`,
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: 0,
  });

  const t3 = Date.now();
  let classifyDone = 0;
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
        filmTitleStr,
        directorStr,
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
      });
      classifyDone++;
      if (classifyDone % 10 === 0 || classifyDone === splits.length) {
        await pushProgress({
          stage: "classify",
          message: `Classify ${classifyDone}/${splits.length}`,
          totalShots: splits.length,
          extractDone: splits.length,
          classifyDone,
        });
      }
      return wrapped;
    },
  );
  const classifications = classifyResults.map((r) => r.classification);
  const fallbackCount = classifyResults.filter((r) => r.usedFallback).length;
  const geminiOk = splits.length - fallbackCount;
  console.log(
    `[worker] Classification complete: ${geminiOk} Gemini, ${fallbackCount} template fallback (see classification_source in DB)`,
  );
  if (fallbackCount > 0) {
    console.warn(
      `[worker] ${fallbackCount}/${splits.length} shots used fallback — Gemini returned no parseable JSON (or API error before parse). Check Railway GOOGLE_API_KEY, billing/quota, GEMINI_CLASSIFY_MODEL / GEMINI_ADJUDICATE_MODEL.`,
    );
  }
  emit({
    type: "step",
    step: "classify",
    status: "complete",
    message: `${splits.length} classified`,
    duration: (Date.now() - t3) / 1000,
  });
  await pushProgress({
    stage: "classify",
    message: `${splits.length} classified`,
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
  });

  emit({
    type: "step",
    step: "group",
    status: "active",
    message: "Resolving film record and replacing any previous ingest data…",
  });
  await pushProgress({
    stage: "group",
    message: "Preparing film record…",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
  });

  const t4 = Date.now();

  const [existingFilm] = await db
    .select({ id: schema.films.id })
    .from(schema.films)
    .where(eq(schema.films.title, filmTitleStr))
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
        title: filmTitleStr,
        director: directorStr,
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
  ctx.ingestRunId = await createIngestRunRecord(db, filmId);
  emit({
    type: "step",
    step: "group",
    status: "complete",
    message: "Film record ready for shot writes",
    duration: (Date.now() - t4) / 1000,
  });
  await pushProgress({
    stage: "group",
    message: "Film record ready",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
  });

  if (ctx.ingestRunId) await setIngestRunStage(db, ctx.ingestRunId, "write");
  emit({ type: "step", step: "write", status: "active", message: "Upload + database..." });
  await pushProgress({
    stage: "write",
    message: "Upload + database…",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
    writeDone: 0,
  });

  const t5 = Date.now();

  const uploadedAssets = await processInParallel(
    localAssets,
    Math.min(concurrency * 3, 20),
    async (asset) => uploadAssets(asset),
  );

  const searchTexts = splits.map((_, i) =>
    [
      filmTitleStr,
      directorStr,
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
    const sceneId = null;
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
        confidence: cls.confidence ?? 0.3,
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
    if (shotCount % 15 === 0 || shotCount === splits.length) {
      await pushProgress({
        stage: "write",
        message: `Write ${shotCount}/${splits.length}`,
        totalShots: splits.length,
        extractDone: splits.length,
        classifyDone: splits.length,
        writeDone: shotCount,
      });
    }
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
  if (ctx.ingestRunId) {
    await completeIngestRunRecord(db, ctx.ingestRunId, shotCount, 0);
  }
  emit({
    type: "complete",
    filmId,
    filmTitle: filmTitleStr,
    shotCount,
    sceneCount: 0,
  });
  await pushProgress({
    stage: "complete",
    message: "Done",
    totalShots: splits.length,
    extractDone: splits.length,
    classifyDone: splits.length,
    writeDone: shotCount,
  });

  return {
    filmId,
    filmTitle: filmTitleStr,
    shotCount,
    sceneCount: 0,
  };
}
