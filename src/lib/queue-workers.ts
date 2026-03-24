// ---------------------------------------------------------------------------
// Queue worker processors for MetroVision 50-film pilot pipeline
// ---------------------------------------------------------------------------

import { eq, and, count } from "drizzle-orm";

import { db, schema } from "@/db";
import { generateTextEmbedding, buildShotSearchText } from "@/db/embeddings";
import {
  detectShots,
  extractAndUpload,
  classifyShot,
  sanitize,
} from "@/lib/ingest-pipeline";
import {
  enqueueJob,
  claimJob,
  completeJob,
  failJob,
} from "@/lib/queue";
import type { JobStage } from "@/lib/queue";
import { searchTmdbMovieId, fetchTmdbCast } from "@/lib/tmdb";
import { validateClassification } from "@/lib/validation-rules";

// ---------------------------------------------------------------------------
// Detect worker: shot boundary detection for a film
// ---------------------------------------------------------------------------

export async function processDetectQueue(workerId: string): Promise<void> {
  const job = await claimJob("detect", workerId);
  if (!job) return;

  try {
    const filmId = job.filmId;
    if (!filmId) throw new Error("detect job missing filmId");

    // Get film record
    const [film] = await db
      .select()
      .from(schema.films)
      .where(eq(schema.films.id, filmId));

    if (!film) throw new Error(`Film not found: ${filmId}`);

    // Source URL from job metadata (set during enqueue from archive-org scrape)
    const sourceUrl =
      (job.metadata as Record<string, unknown> | null)?.sourceUrl as string | undefined;
    if (!sourceUrl) throw new Error("detect job missing sourceUrl in metadata");

    // Run shot detection
    const splits = await detectShots(sourceUrl);
    const filmSlug = sanitize(film.title);

    // Insert shot records and enqueue extract jobs
    for (const split of splits) {
      const duration = split.end - split.start;

      const [shotRow] = await db
        .insert(schema.shots)
        .values({
          filmId,
          startTc: split.start,
          endTc: split.end,
          duration,
          sourceFile: sourceUrl,
        })
        .returning({ id: schema.shots.id });

      // Enqueue extract job for this shot
      await enqueueJob(filmId, "extract", shotRow.id, {
        sourceUrl,
        filmSlug,
        start: split.start,
        end: split.end,
        index: split.index,
      });
    }

    await completeJob(job.id, { shotCount: splits.length });
    console.log(
      `[${workerId}] detect complete: ${film.title} — ${splits.length} shots`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    console.error(`[${workerId}] detect failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Extract worker: extract clip + thumbnail, upload to S3
// ---------------------------------------------------------------------------

export async function processExtractQueue(workerId: string): Promise<void> {
  const job = await claimJob("extract", workerId);
  if (!job) return;

  try {
    const shotId = job.shotId;
    if (!shotId) throw new Error("extract job missing shotId");

    const meta = (job.metadata as Record<string, unknown> | null) ?? {};
    const sourceUrl = meta.sourceUrl as string;
    const filmSlug = meta.filmSlug as string;
    const start = meta.start as number;
    const end = meta.end as number;
    const index = meta.index as number;

    if (!sourceUrl || !filmSlug)
      throw new Error("extract job missing sourceUrl or filmSlug in metadata");

    const split = { start, end, index };
    const { clipKey, thumbnailKey } = await extractAndUpload(
      sourceUrl,
      split,
      filmSlug,
    );

    // Update shot record with S3 URLs
    await db
      .update(schema.shots)
      .set({
        videoUrl: clipKey,
        thumbnailUrl: thumbnailKey,
      })
      .where(eq(schema.shots.id, shotId));

    // Enqueue classify job
    await enqueueJob(job.filmId!, "classify", shotId, {
      sourceUrl,
      filmSlug,
      start,
      end,
      index,
    });

    await completeJob(job.id, { clipKey, thumbnailKey });
    console.log(`[${workerId}] extract complete: shot ${shotId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    console.error(`[${workerId}] extract failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Classify worker: Gemini classification + validation
// ---------------------------------------------------------------------------

export async function processClassifyQueue(workerId: string): Promise<void> {
  const job = await claimJob("classify", workerId);
  if (!job) return;

  try {
    const shotId = job.shotId;
    const filmId = job.filmId;
    if (!shotId || !filmId)
      throw new Error("classify job missing shotId or filmId");

    // Get film info
    const [film] = await db
      .select()
      .from(schema.films)
      .where(eq(schema.films.id, filmId));

    if (!film) throw new Error(`Film not found: ${filmId}`);

    // Get shot info
    const [shot] = await db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.id, shotId));

    if (!shot) throw new Error(`Shot not found: ${shotId}`);

    const meta = (job.metadata as Record<string, unknown> | null) ?? {};
    const sourceUrl = meta.sourceUrl as string;
    const start = meta.start as number;
    const end = meta.end as number;
    const index = meta.index as number;

    if (!sourceUrl)
      throw new Error("classify job missing sourceUrl in metadata");

    // Fetch TMDB cast if available
    let castList: string[] = [];
    if (film.tmdbId) {
      castList = await fetchTmdbCast(film.tmdbId);
    } else {
      // Try to find TMDB ID
      const tmdbId = await searchTmdbMovieId(film.title, film.year);
      if (tmdbId) {
        await db
          .update(schema.films)
          .set({ tmdbId })
          .where(eq(schema.films.id, filmId));
        castList = await fetchTmdbCast(tmdbId);
      }
    }

    // Run classification
    const split = { start, end, index };
    const classification = await classifyShot(
      sourceUrl,
      split,
      film.title,
      film.director,
      film.year ?? 0,
      castList,
    );

    // Validate
    const duration = (shot.endTc ?? 0) - (shot.startTc ?? 0);
    const validation = validateClassification(classification, duration);

    // Determine review status
    const reviewStatus =
      validation.confidence < 0.7 ? "needs_review" : "auto_approved";

    // Write shot metadata (cast string fields to schema types)
    type MetaInsert = typeof schema.shotMetadata.$inferInsert;
    const metaValues = {
      shotId,
      movementType: classification.movement_type as MetaInsert["movementType"],
      direction: classification.direction as MetaInsert["direction"],
      speed: classification.speed as MetaInsert["speed"],
      shotSize: classification.shot_size as MetaInsert["shotSize"],
      angleVertical: classification.angle_vertical as MetaInsert["angleVertical"],
      angleHorizontal: classification.angle_horizontal as MetaInsert["angleHorizontal"],
      angleSpecial: classification.angle_special,
      durationCat: classification.duration_cat as MetaInsert["durationCat"],
      isCompound: classification.is_compound,
      compoundParts: classification.compound_parts as MetaInsert["compoundParts"],
      classificationSource: "gemini_pipeline",
      confidence: validation.confidence,
      reviewStatus,
      validationFlags: validation.flags.length > 0 ? validation.flags : null,
    };
    await db
      .insert(schema.shotMetadata)
      .values(metaValues)
      .onConflictDoUpdate({
        target: schema.shotMetadata.shotId,
        set: metaValues,
      });

    // Write semantic data
    await db
      .insert(schema.shotSemantic)
      .values({
        shotId,
        description: classification.description,
        subjects: classification.subjects,
        mood: classification.mood,
        lighting: classification.lighting,
      })
      .onConflictDoUpdate({
        target: schema.shotSemantic.shotId,
        set: {
          description: classification.description,
          subjects: classification.subjects,
          mood: classification.mood,
          lighting: classification.lighting,
        },
      });

    // Enqueue embed job
    await enqueueJob(filmId, "embed", shotId);

    await completeJob(job.id, {
      confidence: validation.confidence,
      flags: validation.flags,
      autoFixes: validation.autoFixes.length,
      reviewStatus,
    });

    console.log(
      `[${workerId}] classify complete: shot ${shotId} — confidence ${validation.confidence.toFixed(2)}, ${validation.flags.length} flags`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    console.error(`[${workerId}] classify failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Embed worker: generate text embedding for a shot
// ---------------------------------------------------------------------------

export async function processEmbedQueue(workerId: string): Promise<void> {
  const job = await claimJob("embed", workerId);
  if (!job) return;

  try {
    const shotId = job.shotId;
    if (!shotId) throw new Error("embed job missing shotId");

    // Load shot with details for building search text
    const [shot] = await db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.id, shotId));

    if (!shot) throw new Error(`Shot not found: ${shotId}`);

    const [film] = await db
      .select()
      .from(schema.films)
      .where(eq(schema.films.id, shot.filmId));

    const [metadata] = await db
      .select()
      .from(schema.shotMetadata)
      .where(eq(schema.shotMetadata.shotId, shotId));

    const [semantic] = await db
      .select()
      .from(schema.shotSemantic)
      .where(eq(schema.shotSemantic.shotId, shotId));

    if (!film || !metadata) {
      throw new Error(`Missing film or metadata for shot ${shotId}`);
    }

    // Build search text from shot details
    const shotWithDetails = {
      film: { title: film.title, director: film.director },
      metadata: {
        movementType: metadata.movementType,
        direction: metadata.direction,
        speed: metadata.speed,
        shotSize: metadata.shotSize,
      },
      semantic: semantic ?? null,
    };

    const searchText = buildShotSearchText(shotWithDetails as Parameters<typeof buildShotSearchText>[0]);
    const embedding = await generateTextEmbedding(searchText);

    // Upsert embedding
    await db
      .insert(schema.shotEmbeddings)
      .values({
        shotId,
        embedding,
        searchText,
      })
      .onConflictDoUpdate({
        target: schema.shotEmbeddings.shotId,
        set: {
          embedding,
          searchText,
        },
      });

    await completeJob(job.id, { searchTextLength: searchText.length });
    console.log(`[${workerId}] embed complete: shot ${shotId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failJob(job.id, message);
    console.error(`[${workerId}] embed failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Main worker loop: processes all queues in priority order
// ---------------------------------------------------------------------------

const STAGE_PRIORITY: JobStage[] = ["detect", "extract", "classify", "embed"];

const STAGE_PROCESSORS: Record<JobStage, (workerId: string) => Promise<void>> = {
  detect: processDetectQueue,
  extract: processExtractQueue,
  classify: processClassifyQueue,
  embed: processEmbedQueue,
};

async function hasQueuedJobs(stage: JobStage): Promise<boolean> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.pipelineJobs)
    .where(
      and(
        eq(schema.pipelineJobs.stage, stage),
        eq(schema.pipelineJobs.status, "queued"),
      ),
    );
  return (row?.c ?? 0) > 0;
}

export async function runWorkerLoop(workerId: string): Promise<void> {
  console.log(`[${workerId}] Worker loop started`);

  while (true) {
    let processedAny = false;

    for (const stage of STAGE_PRIORITY) {
      try {
        const hasWork = await hasQueuedJobs(stage);
        if (!hasWork) continue;

        await STAGE_PROCESSORS[stage](workerId);
        processedAny = true;
        break; // Restart from highest-priority stage
      } catch (err) {
        console.error(
          `[${workerId}] Error in ${stage} queue:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (!processedAny) {
      // No jobs found in any queue — sleep before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
