import { randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { Request, Response } from "express";

import { db, schema } from "./db.js";
import {
  runWorkerIngestFilmPipeline,
  type WorkerIngestProgressSnapshot,
} from "./ingest-pipeline-core.js";
import { parseIngestTimelineFromBody } from "../../src/lib/ingest-pipeline.js";
import { failIngestRunRecord } from "../../src/lib/ingest-run-record.js";
import { logServerEvent } from "../../src/lib/server-log.js";
import { checkWorkerIngestSecret } from "../../src/lib/worker-route-secret.js";

type IngestAsyncJobRow = typeof schema.ingestAsyncJobs.$inferSelect;

function validateIngestBody(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null;
}

function normalizeReclassifyShotIdsBody(raw: unknown): string[] {
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

export async function ingestFilmHandler(req: Request, res: Response) {
  const gate = checkWorkerIngestSecret((n) => req.get(n));
  if (!gate.ok) {
    res.status(gate.status).json(gate.body);
    return;
  }

  const body = req.body;

  if (!body.videoPath && !body.videoUrl) {
    res.status(400).json({ error: "videoPath or videoUrl is required" });
    return;
  }

  const reclassifyShotIds = normalizeReclassifyShotIdsBody(body.reclassifyShotIds);
  if (reclassifyShotIds.length > 0) {
    if (typeof body.filmId !== "string" || !body.filmId.trim()) {
      res.status(400).json({ error: "filmId is required when reclassifyShotIds is set" });
      return;
    }
  } else if (!body.filmTitle || !body.director || !body.year) {
    res.status(400).json({ error: "filmTitle, director, and year are required" });
    return;
  }

  try {
    parseIngestTimelineFromBody(body as Record<string, unknown>);
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

  const ctx = { ingestRunId: null as string | null };
  try {
    await runWorkerIngestFilmPipeline(body as Record<string, unknown>, emit, ctx);
  } catch (error) {
    const msg = (error as Error).message || "Pipeline failed";
    logServerEvent("error", "worker_ingest_film_stream_failed", {
      message: msg,
      ...(ctx.ingestRunId ? { ingestRunId: ctx.ingestRunId } : {}),
      err:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });
    if (ctx.ingestRunId) {
      await failIngestRunRecord(db, ctx.ingestRunId, msg).catch(() => {});
    }
    emit({ type: "error", message: msg });
  } finally {
    res.end();
  }
}

async function patchIngestAsyncJob(
  jobId: string,
  patch: {
    status?: string;
    stage?: string;
    progress?: Record<string, unknown>;
    filmId?: string | null;
    ingestRunId?: string | null;
    errorMessage?: string | null;
  },
) {
  await db
    .update(schema.ingestAsyncJobs)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
      ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
      ...(patch.filmId !== undefined ? { filmId: patch.filmId } : {}),
      ...(patch.ingestRunId !== undefined ? { ingestRunId: patch.ingestRunId } : {}),
      ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.ingestAsyncJobs.id, jobId));
}

function progressToRow(p: WorkerIngestProgressSnapshot): Record<string, unknown> {
  return {
    stage: p.stage,
    message: p.message,
    totalShots: p.totalShots,
    extractDone: p.extractDone,
    classifyDone: p.classifyDone,
    writeDone: p.writeDone,
    updatedAt: Date.now(),
  };
}

async function executeIngestAsyncJobRow(row: IngestAsyncJobRow): Promise<void> {
  const jobId = row.id;
  const body = row.requestBody as Record<string, unknown>;
  const ctx = { ingestRunId: null as string | null };
  const noopEmit = () => {};

  try {
    const outcome = await runWorkerIngestFilmPipeline(body, noopEmit, ctx, async (p) => {
      await patchIngestAsyncJob(jobId, {
        stage: p.stage,
        progress: progressToRow(p),
        ...(ctx.ingestRunId ? { ingestRunId: ctx.ingestRunId } : {}),
      });
    });

    await patchIngestAsyncJob(jobId, {
      status: "completed",
      stage: "complete",
      filmId: outcome.filmId,
      ingestRunId: ctx.ingestRunId,
      progress: {
        ...progressToRow({
          stage: "complete",
          message: "Ingest finished",
          totalShots: outcome.shotCount,
          extractDone: outcome.shotCount,
          classifyDone: outcome.shotCount,
          writeDone: outcome.shotCount,
        }),
        filmId: outcome.filmId,
        shotCount: outcome.shotCount,
        sceneCount: outcome.sceneCount,
      },
    });
  } catch (error) {
    const msg = (error as Error).message || "Pipeline failed";
    if (ctx.ingestRunId) {
      await failIngestRunRecord(db, ctx.ingestRunId, msg).catch(() => {});
    }
    await patchIngestAsyncJob(jobId, {
      status: "failed",
      stage: "failed",
      errorMessage: msg.slice(0, 4000),
      ingestRunId: ctx.ingestRunId,
      progress: { message: msg.slice(0, 500), stage: "failed", updatedAt: Date.now() },
    });
    logServerEvent("error", "worker_ingest_async_job_failed", {
      jobId,
      message: msg,
      err: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
  }
}

/** Claim a specific queued job (POST /async path). */
export async function claimIngestAsyncJobById(jobId: string): Promise<IngestAsyncJobRow | null> {
  const [row] = await db
    .update(schema.ingestAsyncJobs)
    .set({ status: "running", stage: "running", updatedAt: new Date() })
    .where(and(eq(schema.ingestAsyncJobs.id, jobId), eq(schema.ingestAsyncJobs.status, "queued")))
    .returning();
  return row ?? null;
}

/** SKIP LOCKED: claim the oldest queued job for crash recovery / multi-worker. */
export async function claimNextQueuedIngestJobRow(): Promise<IngestAsyncJobRow | null> {
  const q = sql`
    WITH c AS (
      SELECT id FROM ingest_async_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ingest_async_jobs j
    SET status = 'running', stage = 'running', updated_at = now()
    FROM c
    WHERE j.id = c.id
    RETURNING j.id
  `;
  const r = await db.execute(q);
  const rows = r.rows as { id: string }[];
  const id = rows[0]?.id;
  if (!id) return null;
  const [full] = await db
    .select()
    .from(schema.ingestAsyncJobs)
    .where(eq(schema.ingestAsyncJobs.id, id))
    .limit(1);
  return full ?? null;
}

export async function processIngestAsyncJobById(jobId: string): Promise<void> {
  const row = await claimIngestAsyncJobById(jobId);
  if (row) await executeIngestAsyncJobRow(row);
}

export async function ingestFilmAsyncPostHandler(req: Request, res: Response) {
  const gate = checkWorkerIngestSecret((n) => req.get(n));
  if (!gate.ok) {
    res.status(gate.status).json(gate.body);
    return;
  }

  if (!validateIngestBody(req.body)) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const body = req.body as Record<string, unknown>;

  if (!body.videoPath && !body.videoUrl) {
    res.status(400).json({ error: "videoPath or videoUrl is required" });
    return;
  }

  const asyncReclassifyIds = normalizeReclassifyShotIdsBody(body.reclassifyShotIds);
  if (asyncReclassifyIds.length > 0) {
    if (typeof body.filmId !== "string" || !body.filmId.trim()) {
      res.status(400).json({ error: "filmId is required when reclassifyShotIds is set" });
      return;
    }
  } else if (!body.filmTitle || !body.director || !body.year) {
    res.status(400).json({ error: "filmTitle, director, and year are required" });
    return;
  }

  try {
    parseIngestTimelineFromBody(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid timeline fields";
    res.status(400).json({ error: message });
    return;
  }

  const pollToken = randomBytes(24).toString("hex");
  const [row] = await db
    .insert(schema.ingestAsyncJobs)
    .values({
      status: "queued",
      stage: "queued",
      pollToken,
      requestBody: body,
      progress: { message: "Queued", stage: "queued", updatedAt: Date.now() },
    })
    .returning({ id: schema.ingestAsyncJobs.id });

  const jobId = row!.id;
  setImmediate(() => {
    void processIngestAsyncJobById(jobId);
  });

  res.status(202).json({
    jobId,
    pollToken,
    pollHint:
      "Poll GET /api/ingest-film/jobs/:jobId?t=… with this token until status is completed or failed.",
  });
}

export async function ingestFilmJobGetHandler(req: Request, res: Response) {
  const rawId = req.params.id;
  const jobId = Array.isArray(rawId) ? rawId[0] : rawId;
  const token = typeof req.query.t === "string" ? req.query.t.trim() : "";
  if (!jobId || !token) {
    res.status(400).json({ error: "job id and query t (poll token) are required" });
    return;
  }

  const [row] = await db
    .select()
    .from(schema.ingestAsyncJobs)
    .where(eq(schema.ingestAsyncJobs.id, jobId))
    .limit(1);

  if (!row || row.pollToken !== token) {
    res.status(404).json({ error: "Unknown job or invalid token" });
    return;
  }

  res.json({
    status: row.status,
    stage: row.stage,
    progress: row.progress ?? null,
    filmId: row.filmId,
    ingestRunId: row.ingestRunId,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

let ingestJobSweepTimer: ReturnType<typeof setInterval> | null = null;

export function startIngestAsyncJobSweep(): void {
  if (ingestJobSweepTimer) return;
  ingestJobSweepTimer = setInterval(() => {
    void (async () => {
      const row = await claimNextQueuedIngestJobRow();
      if (row) await executeIngestAsyncJobRow(row);
    })();
  }, 45_000);
}
