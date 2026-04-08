export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { and, asc, desc, eq, gte, lte, count, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";

// ---------------------------------------------------------------------------
// GET: Fetch batch of shots for review with filters & pagination
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "40", 10) || 40, 200);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;
    const filmId = searchParams.get("filmId");
    const reviewStatus = searchParams.get("reviewStatus");
    const confidenceMin = searchParams.get("confidenceMin");
    const confidenceMax = searchParams.get("confidenceMax");
    const sort = searchParams.get("sort") === "confidence" ? "confidence" : "priority";

    // Build WHERE conditions
    const conditions = [];

    // Default: show needs_review unless a specific status is requested
    if (reviewStatus) {
      conditions.push(eq(schema.shotMetadata.reviewStatus, reviewStatus));
    } else {
      conditions.push(eq(schema.shotMetadata.reviewStatus, "needs_review"));
    }

    if (filmId) {
      conditions.push(eq(schema.shots.filmId, filmId));
    }

    if (confidenceMin) {
      const min = parseFloat(confidenceMin);
      if (!isNaN(min)) conditions.push(gte(schema.shotMetadata.confidence, min));
    }

    if (confidenceMax) {
      const max = parseFloat(confidenceMax);
      if (!isNaN(max)) conditions.push(lte(schema.shotMetadata.confidence, max));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orderByExprs =
      sort === "confidence"
        ? [asc(schema.shotMetadata.confidence)]
        : [
            sql`(case when ${schema.shotMetadata.classificationSource} = 'gemini_fallback' then 0 else 1 end)`,
            desc(schema.shots.duration),
            asc(schema.shotMetadata.confidence),
          ];

    // Count total matching rows for pagination
    const [{ total }] = await db
      .select({ total: count() })
      .from(schema.shotMetadata)
      .innerJoin(schema.shots, eq(schema.shots.id, schema.shotMetadata.shotId))
      .where(whereClause);

    // Fetch the page of shots
    const rows = await db
      .select({
        shotId: schema.shots.id,
        filmId: schema.shots.filmId,
        filmTitle: schema.films.title,
        filmDirector: schema.films.director,
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
      .innerJoin(schema.films, eq(schema.films.id, schema.shots.filmId))
      .leftJoin(
        schema.shotSemantic,
        eq(schema.shotSemantic.shotId, schema.shotMetadata.shotId),
      )
      .where(whereClause)
      .orderBy(...orderByExprs)
      .limit(limit)
      .offset(offset);

    // Also return distinct films for the filter dropdown
    const films = await db
      .selectDistinct({
        id: schema.films.id,
        title: schema.films.title,
      })
      .from(schema.films)
      .innerJoin(schema.shots, eq(schema.shots.filmId, schema.films.id))
      .innerJoin(schema.shotMetadata, eq(schema.shotMetadata.shotId, schema.shots.id))
      .orderBy(schema.films.title);

    return NextResponse.json({ rows, total, films });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch review queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST: Submit review decisions (single or bulk)
// ---------------------------------------------------------------------------

type ReviewRequest = {
  shotId?: string;
  shotIds?: string[];
  action: "approve" | "correct";
  corrections?: Record<string, string>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewRequest;

    // Support both single shotId and bulk shotIds
    const shotIds = body.shotIds ?? (body.shotId ? [body.shotId] : []);

    if (shotIds.length === 0 || !body.action) {
      return NextResponse.json(
        { error: "shotId/shotIds and action are required." },
        { status: 400 },
      );
    }

    if (body.action === "approve") {
      await db
        .update(schema.shotMetadata)
        .set({ reviewStatus: "human_verified" })
        .where(inArray(schema.shotMetadata.shotId, shotIds));

      return NextResponse.json({ ok: true, status: "human_verified", count: shotIds.length });
    }

    if (body.action === "correct") {
      if (shotIds.length > 1) {
        return NextResponse.json(
          { error: "Corrections can only be applied to a single shot." },
          { status: 400 },
        );
      }

      const corrections = body.corrections ?? {};
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
        .where(eq(schema.shotMetadata.shotId, shotIds[0]));

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
          .where(eq(schema.shotSemantic.shotId, shotIds[0]));
      }

      return NextResponse.json({ ok: true, status: "human_corrected", count: 1 });
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
