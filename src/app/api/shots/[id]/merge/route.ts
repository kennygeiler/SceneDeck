export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { and, asc, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import type { HitlAuditEntry } from "@/db/schema";

const BOUNDARY_EPS_SEC = 0.35;

function appendHitlAudit(
  existing: HitlAuditEntry[] | null | undefined,
  entry: HitlAuditEntry,
): HitlAuditEntry[] {
  return [...(existing ?? []), entry];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: shotAId } = await context.params;
  let body: { mergeWithShotId?: unknown } = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object") {
      body = raw as { mergeWithShotId?: unknown };
    }
  } catch {
    body = {};
  }

  const requestedB =
    typeof body.mergeWithShotId === "string" && body.mergeWithShotId.length > 0
      ? body.mergeWithShotId
      : null;

  const [shotA] = await db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotAId))
    .limit(1);

  if (!shotA) {
    return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  }

  const endA = shotA.endTc;
  const startA = shotA.startTc;
  if (endA == null || startA == null) {
    return NextResponse.json({ error: "Shot is missing start/end timecodes" }, { status: 400 });
  }

  let shotB: typeof schema.shots.$inferSelect | null = null;

  if (requestedB) {
    if (requestedB === shotAId) {
      return NextResponse.json({ error: "Cannot merge a shot with itself" }, { status: 400 });
    }
    const [b] = await db
      .select()
      .from(schema.shots)
      .where(eq(schema.shots.id, requestedB))
      .limit(1);
    shotB = b ?? null;
  } else {
    const [cand] = await db
      .select()
      .from(schema.shots)
      .where(
        and(
          eq(schema.shots.filmId, shotA.filmId),
          gte(schema.shots.startTc, endA - BOUNDARY_EPS_SEC),
        ),
      )
      .orderBy(asc(schema.shots.startTc))
      .limit(1);
    if (
      cand &&
      cand.id !== shotAId &&
      cand.startTc != null &&
      Math.abs(cand.startTc - endA) <= BOUNDARY_EPS_SEC
    ) {
      shotB = cand;
    }
  }

  if (!shotB) {
    return NextResponse.json({ error: "Adjacent next shot not found" }, { status: 400 });
  }

  const shotBId = shotB.id;

  if (shotB.filmId !== shotA.filmId) {
    return NextResponse.json({ error: "Next shot belongs to a different film" }, { status: 400 });
  }

  if (shotB.startTc == null || Math.abs(shotB.startTc - endA) > BOUNDARY_EPS_SEC) {
    return NextResponse.json(
      { error: "Next shot does not align with this shot's end time" },
      { status: 400 },
    );
  }

  const newEnd = shotB.endTc;
  if (newEnd == null) {
    return NextResponse.json({ error: "Next shot is missing end timecode" }, { status: 400 });
  }

  const at = new Date().toISOString();

  try {
    await db
      .update(schema.shots)
      .set({
        endTc: newEnd,
        duration: newEnd - startA,
        hitlAudit: appendHitlAudit(shotA.hitlAudit, {
          at,
          action: "merge",
          payload: { mergedShotId: shotBId, previousEndTc: endA, newEndTc: newEnd },
        }),
      })
      .where(eq(schema.shots.id, shotAId));

    await db
      .update(schema.shotMetadata)
      .set({ reviewStatus: "needs_review" })
      .where(eq(schema.shotMetadata.shotId, shotAId));

    await db.delete(schema.shots).where(eq(schema.shots.id, shotBId));

    await db.delete(schema.shotEmbeddings).where(eq(schema.shotEmbeddings.shotId, shotAId));
    await db
      .delete(schema.shotImageEmbeddings)
      .where(eq(schema.shotImageEmbeddings.shotId, shotAId));
    await db.delete(schema.shotObjects).where(eq(schema.shotObjects.shotId, shotAId));

    return NextResponse.json({ ok: true, removedShotId: shotBId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Merge failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
