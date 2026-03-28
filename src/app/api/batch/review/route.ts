export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";

// ---------------------------------------------------------------------------
// GET: Fetch next batch of shots needing review
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10) || 20;

    const rows = await db
      .select({
        shotId: schema.shots.id,
        filmId: schema.shots.filmId,
        startTc: schema.shots.startTc,
        endTc: schema.shots.endTc,
        duration: schema.shots.duration,
        thumbnailUrl: schema.shots.thumbnailUrl,
        // metadata
        framing: schema.shotMetadata.framing,
        shotSize: schema.shotMetadata.shotSize,
        depth: schema.shotMetadata.depth,
        blocking: schema.shotMetadata.blocking,
        confidence: schema.shotMetadata.confidence,
        reviewStatus: schema.shotMetadata.reviewStatus,
        classificationSource: schema.shotMetadata.classificationSource,
        // semantic
        description: schema.shotSemantic.description,
        mood: schema.shotSemantic.mood,
        lighting: schema.shotSemantic.lighting,
        subjects: schema.shotSemantic.subjects,
      })
      .from(schema.shotMetadata)
      .innerJoin(schema.shots, eq(schema.shots.id, schema.shotMetadata.shotId))
      .leftJoin(
        schema.shotSemantic,
        eq(schema.shotSemantic.shotId, schema.shotMetadata.shotId),
      )
      .where(eq(schema.shotMetadata.reviewStatus, "needs_review"))
      .orderBy(schema.shots.createdAt)
      .limit(limit);

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch review queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST: Submit a review decision
// ---------------------------------------------------------------------------

type ReviewRequest = {
  shotId: string;
  action: "approve" | "correct";
  corrections?: Record<string, string>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewRequest;

    if (!body.shotId || !body.action) {
      return NextResponse.json(
        { error: "shotId and action are required." },
        { status: 400 },
      );
    }

    if (body.action === "approve") {
      await db
        .update(schema.shotMetadata)
        .set({ reviewStatus: "human_verified" })
        .where(eq(schema.shotMetadata.shotId, body.shotId));

      return NextResponse.json({ ok: true, status: "human_verified" });
    }

    if (body.action === "correct") {
      const corrections = body.corrections ?? {};

      // Build the update payload from allowed correction fields
      const metadataUpdate: Record<string, unknown> = {
        reviewStatus: "human_corrected",
      };

      const allowedMetadataFields = [
        "framing",
        "depth",
        "blocking",
        "shotSize",
        "angleVertical",
        "angleHorizontal",
        "durationCat",
      ] as const;

      for (const field of allowedMetadataFields) {
        if (corrections[field]) {
          metadataUpdate[field] = corrections[field];
        }
      }

      await db
        .update(schema.shotMetadata)
        .set(metadataUpdate)
        .where(eq(schema.shotMetadata.shotId, body.shotId));

      // Also update semantic fields if provided
      const semanticUpdate: Record<string, unknown> = {};
      const allowedSemanticFields = [
        "description",
        "mood",
        "lighting",
      ] as const;

      for (const field of allowedSemanticFields) {
        if (corrections[field]) {
          semanticUpdate[field] = corrections[field];
        }
      }

      if (Object.keys(semanticUpdate).length > 0) {
        await db
          .update(schema.shotSemantic)
          .set(semanticUpdate)
          .where(eq(schema.shotSemantic.shotId, body.shotId));
      }

      return NextResponse.json({ ok: true, status: "human_corrected" });
    }

    return NextResponse.json(
      { error: 'action must be "approve" or "correct".' },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
