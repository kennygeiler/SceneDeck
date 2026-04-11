import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaryCutPresets,
  boundaryEvalRuns,
  evalGoldRevisions,
  films,
} from "@/db/schema";

export async function listBoundaryCutPresets(includeArchived = false) {
  if (!includeArchived) {
    return db
      .select()
      .from(boundaryCutPresets)
      .where(eq(boundaryCutPresets.isArchived, false))
      .orderBy(asc(boundaryCutPresets.name));
  }
  return db.select().from(boundaryCutPresets).orderBy(asc(boundaryCutPresets.name));
}

export async function getBoundaryCutPresetById(id: string) {
  const [row] = await db
    .select()
    .from(boundaryCutPresets)
    .where(eq(boundaryCutPresets.id, id))
    .limit(1);
  return row ?? null;
}

export async function getBoundaryCutPresetBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(boundaryCutPresets)
    .where(eq(boundaryCutPresets.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function insertBoundaryCutPreset(values: {
  name: string;
  slug?: string | null;
  description?: string | null;
  config: (typeof boundaryCutPresets.$inferInsert)["config"];
}) {
  const [row] = await db
    .insert(boundaryCutPresets)
    .values({
      name: values.name,
      slug: values.slug ?? null,
      description: values.description ?? null,
      config: values.config,
    })
    .returning();
  return row ?? null;
}

export async function updateBoundaryCutPreset(
  id: string,
  patch: Partial<{
    name: string;
    slug: string | null;
    description: string | null;
    config: (typeof boundaryCutPresets.$inferInsert)["config"];
    isArchived: boolean;
  }>,
) {
  const [row] = await db
    .update(boundaryCutPresets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(boundaryCutPresets.id, id))
    .returning();
  return row ?? null;
}

export async function insertEvalGoldRevision(values: {
  filmId: string;
  windowStartSec: number | null;
  windowEndSec: number | null;
  payload: Record<string, unknown>;
  replacesRevisionId?: string | null;
  createdBy?: string | null;
}) {
  const [row] = await db
    .insert(evalGoldRevisions)
    .values({
      filmId: values.filmId,
      windowStartSec: values.windowStartSec,
      windowEndSec: values.windowEndSec,
      payload: values.payload,
      replacesRevisionId: values.replacesRevisionId ?? null,
      createdBy: values.createdBy ?? null,
    })
    .returning();
  return row ?? null;
}

export async function listEvalGoldRevisionsForFilm(filmId: string) {
  return db
    .select()
    .from(evalGoldRevisions)
    .where(eq(evalGoldRevisions.filmId, filmId))
    .orderBy(desc(evalGoldRevisions.createdAt));
}

export async function getEvalGoldRevisionById(id: string) {
  const [row] = await db
    .select()
    .from(evalGoldRevisions)
    .where(eq(evalGoldRevisions.id, id))
    .limit(1);
  return row ?? null;
}

/** Latest revision for the same film + window (both null window = full film). */
export async function getLatestEvalGoldRevisionForWindow(
  filmId: string,
  windowStartSec: number | null,
  windowEndSec: number | null,
) {
  const ws = windowStartSec == null ? isNull(evalGoldRevisions.windowStartSec) : eq(evalGoldRevisions.windowStartSec, windowStartSec);
  const we = windowEndSec == null ? isNull(evalGoldRevisions.windowEndSec) : eq(evalGoldRevisions.windowEndSec, windowEndSec);
  const [row] = await db
    .select()
    .from(evalGoldRevisions)
    .where(and(eq(evalGoldRevisions.filmId, filmId), ws, we))
    .orderBy(desc(evalGoldRevisions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertBoundaryEvalRun(values: {
  filmId: string;
  goldRevisionId: string;
  presetId: string | null;
  predictedPayload: Record<string, unknown>;
  toleranceSec: number;
  metrics: Record<string, unknown>;
  unmatchedGoldSec: number[];
  unmatchedPredSec: number[];
  provenance?: Record<string, unknown> | null;
}) {
  const [row] = await db
    .insert(boundaryEvalRuns)
    .values({
      filmId: values.filmId,
      goldRevisionId: values.goldRevisionId,
      presetId: values.presetId,
      predictedPayload: values.predictedPayload,
      toleranceSec: values.toleranceSec,
      metrics: values.metrics,
      unmatchedGoldSec: values.unmatchedGoldSec,
      unmatchedPredSec: values.unmatchedPredSec,
      provenance: values.provenance ?? null,
    })
    .returning();
  return row ?? null;
}

export async function getBoundaryEvalRunById(id: string) {
  const [row] = await db
    .select()
    .from(boundaryEvalRuns)
    .where(eq(boundaryEvalRuns.id, id))
    .limit(1);
  return row ?? null;
}

export async function listBoundaryEvalRunsForFilm(filmId: string) {
  return db
    .select()
    .from(boundaryEvalRuns)
    .where(eq(boundaryEvalRuns.filmId, filmId))
    .orderBy(desc(boundaryEvalRuns.createdAt));
}

export async function setFilmBoundaryCutPreset(
  filmId: string,
  presetId: string | null,
) {
  const [row] = await db
    .update(films)
    .set({ boundaryCutPresetId: presetId })
    .where(eq(films.id, filmId))
    .returning({ id: films.id, boundaryCutPresetId: films.boundaryCutPresetId });
  return row ?? null;
}
