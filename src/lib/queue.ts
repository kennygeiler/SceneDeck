// ---------------------------------------------------------------------------
// Simple database-backed job queue for the MetroVision 50-film pilot
// Uses the pipeline_jobs table in Neon — no Redis needed at this scale.
// ---------------------------------------------------------------------------

import { eq, and, count } from "drizzle-orm";

import { db, schema } from "@/db";
import type { PipelineJob } from "@/db/schema";

export type JobStage = "detect" | "extract" | "classify" | "embed";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "needs_review";

// ---------------------------------------------------------------------------
// Enqueue a new job
// ---------------------------------------------------------------------------

export async function enqueueJob(
  filmId: string,
  stage: JobStage,
  shotId?: string,
  metadata?: Record<string, unknown>,
): Promise<string> {
  const [row] = await db
    .insert(schema.pipelineJobs)
    .values({
      filmId,
      stage,
      shotId: shotId ?? null,
      status: "queued",
      metadata: metadata ?? null,
      attempts: 0,
    })
    .returning({ id: schema.pipelineJobs.id });

  return row.id;
}

// ---------------------------------------------------------------------------
// Claim the next queued job for a given stage (optimistic lock)
// ---------------------------------------------------------------------------

export async function claimJob(
  stage: JobStage,
  workerId: string,
): Promise<PipelineJob | null> {
  // Find the oldest queued job for this stage
  const [candidate] = await db
    .select()
    .from(schema.pipelineJobs)
    .where(
      and(
        eq(schema.pipelineJobs.stage, stage),
        eq(schema.pipelineJobs.status, "queued"),
      ),
    )
    .orderBy(schema.pipelineJobs.createdAt)
    .limit(1);

  if (!candidate) return null;

  // Optimistic lock: only update if still queued
  const [claimed] = await db
    .update(schema.pipelineJobs)
    .set({
      status: "running",
      workerId,
      startedAt: new Date(),
      attempts: (candidate.attempts ?? 0) + 1,
    })
    .where(
      and(
        eq(schema.pipelineJobs.id, candidate.id),
        eq(schema.pipelineJobs.status, "queued"),
      ),
    )
    .returning();

  return claimed ?? null;
}

// ---------------------------------------------------------------------------
// Complete a job
// ---------------------------------------------------------------------------

export async function completeJob(
  jobId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db
    .update(schema.pipelineJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      ...(metadata ? { metadata } : {}),
    })
    .where(eq(schema.pipelineJobs.id, jobId));
}

// ---------------------------------------------------------------------------
// Fail a job
// ---------------------------------------------------------------------------

export async function failJob(
  jobId: string,
  error: string,
): Promise<void> {
  // Read current attempts first
  const [current] = await db
    .select({ attempts: schema.pipelineJobs.attempts })
    .from(schema.pipelineJobs)
    .where(eq(schema.pipelineJobs.id, jobId));

  await db
    .update(schema.pipelineJobs)
    .set({
      status: "failed",
      error,
      attempts: (current?.attempts ?? 0) + 1,
    })
    .where(eq(schema.pipelineJobs.id, jobId));
}

// ---------------------------------------------------------------------------
// Get aggregate counts by stage and status
// ---------------------------------------------------------------------------

export async function getJobCounts(): Promise<
  Record<JobStage, { queued: number; running: number; completed: number; failed: number }>
> {
  const rows = await db
    .select({
      stage: schema.pipelineJobs.stage,
      status: schema.pipelineJobs.status,
      count: count(),
    })
    .from(schema.pipelineJobs)
    .groupBy(schema.pipelineJobs.stage, schema.pipelineJobs.status);

  const stages: JobStage[] = ["detect", "extract", "classify", "embed"];
  const result = {} as Record<
    JobStage,
    { queued: number; running: number; completed: number; failed: number }
  >;

  for (const stage of stages) {
    result[stage] = { queued: 0, running: 0, completed: 0, failed: 0 };
  }

  for (const row of rows) {
    const stage = row.stage as JobStage;
    const status = row.status as JobStatus;
    if (result[stage] && status in result[stage]) {
      result[stage][status as keyof typeof result[typeof stage]] = row.count;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Get all jobs for a specific film
// ---------------------------------------------------------------------------

export async function getJobsForFilm(filmId: string): Promise<PipelineJob[]> {
  return db
    .select()
    .from(schema.pipelineJobs)
    .where(eq(schema.pipelineJobs.filmId, filmId))
    .orderBy(schema.pipelineJobs.createdAt);
}
