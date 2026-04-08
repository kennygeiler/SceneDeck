export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import type { HitlAuditEntry } from "@/db/schema";

const MIN_SEG_SEC = 0.25;

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
  let body: { splitAtSec?: unknown };
  try {
    body = (await request.json()) as { splitAtSec?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const splitAt = Number(body.splitAtSec);
  if (!Number.isFinite(splitAt)) {
    return NextResponse.json({ error: "splitAtSec is required" }, { status: 400 });
  }

  const [shotA] = await db
    .select()
    .from(schema.shots)
    .where(eq(schema.shots.id, shotAId))
    .limit(1);

  if (!shotA) {
    return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  }

  const start = shotA.startTc;
  const end = shotA.endTc;
  if (start == null || end == null) {
    return NextResponse.json({ error: "Shot is missing start/end timecodes" }, { status: 400 });
  }

  if (splitAt <= start + MIN_SEG_SEC || splitAt >= end - MIN_SEG_SEC) {
    return NextResponse.json(
      {
        error:
          "splitAtSec must fall between start and end with at least 0.25s on each side",
      },
      { status: 400 },
    );
  }

  const [meta] = await db
    .select()
    .from(schema.shotMetadata)
    .where(eq(schema.shotMetadata.shotId, shotAId))
    .limit(1);

  if (!meta) {
    return NextResponse.json({ error: "Shot metadata missing" }, { status: 400 });
  }

  const d1 = splitAt - start;
  const d2 = end - splitAt;
  const at = new Date().toISOString();

  let tailId: string | null = null;
  try {
    const [shotB] = await db
      .insert(schema.shots)
      .values({
        filmId: shotA.filmId,
        sceneId: shotA.sceneId,
        sourceFile: shotA.sourceFile,
        startTc: splitAt,
        endTc: end,
        duration: d2,
        videoUrl: shotA.videoUrl,
        thumbnailUrl: shotA.thumbnailUrl,
        hitlAudit: appendHitlAudit(null, {
          at,
          action: "split",
          payload: { headShotId: shotAId, splitAtSec: splitAt, role: "tail" },
        }),
      })
      .returning({ id: schema.shots.id });

    tailId = shotB!.id;

    await db.insert(schema.shotMetadata).values({
      shotId: tailId,
      framing: meta.framing,
      depth: meta.depth,
      blocking: meta.blocking,
      symmetry: meta.symmetry,
      dominantLines: meta.dominantLines,
      lightingDirection: meta.lightingDirection,
      lightingQuality: meta.lightingQuality,
      colorTemperature: meta.colorTemperature,
      foregroundElements: meta.foregroundElements,
      backgroundElements: meta.backgroundElements,
      shotSize: meta.shotSize,
      angleVertical: meta.angleVertical,
      angleHorizontal: meta.angleHorizontal,
      durationCat: meta.durationCat,
      classificationSource: meta.classificationSource,
      confidence: meta.confidence,
      reviewStatus: "needs_review",
    });

    const [sem] = await db
      .select()
      .from(schema.shotSemantic)
      .where(eq(schema.shotSemantic.shotId, shotAId))
      .limit(1);

    if (sem) {
      await db.insert(schema.shotSemantic).values({
        shotId: tailId,
        description: sem.description,
        subjects: sem.subjects,
        mood: sem.mood,
        lighting: sem.lighting,
        techniqueNotes: sem.techniqueNotes,
      });
    }

    await db
      .update(schema.shots)
      .set({
        endTc: splitAt,
        duration: d1,
        hitlAudit: appendHitlAudit(shotA.hitlAudit, {
          at,
          action: "split",
          payload: { splitAtSec: splitAt, tailShotId: tailId, role: "head" },
        }),
      })
      .where(eq(schema.shots.id, shotAId));

    await db
      .update(schema.shotMetadata)
      .set({ reviewStatus: "needs_review" })
      .where(eq(schema.shotMetadata.shotId, shotAId));

    await db.delete(schema.shotEmbeddings).where(eq(schema.shotEmbeddings.shotId, shotAId));
    await db
      .delete(schema.shotImageEmbeddings)
      .where(eq(schema.shotImageEmbeddings.shotId, shotAId));
    await db.delete(schema.shotObjects).where(eq(schema.shotObjects.shotId, shotAId));

    return NextResponse.json({ ok: true, tailShotId: tailId });
  } catch (e) {
    if (tailId) {
      await db.delete(schema.shots).where(eq(schema.shots.id, tailId));
    }
    const message = e instanceof Error ? e.message : "Split failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
