export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { enqueueJob } from "@/lib/queue";

type FilmPayload = {
  title: string;
  director: string;
  year: number;
  sourceUrl: string;
  tmdbId?: number | null;
  posterUrl?: string | null;
  genres?: string[] | null;
};

type SubmitRequest = {
  films: FilmPayload[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitRequest;

    if (!body.films?.length) {
      return NextResponse.json(
        { error: "films array is required and must not be empty." },
        { status: 400 },
      );
    }

    const batchId = randomUUID();
    let filmsQueued = 0;

    for (const film of body.films) {
      if (!film.title || !film.director || !film.sourceUrl) {
        continue; // skip incomplete entries
      }

      // Check for existing film by title to avoid duplicates
      const [existing] = await db
        .select({ id: schema.films.id })
        .from(schema.films)
        .where(eq(schema.films.title, film.title))
        .limit(1);

      let filmId: string;

      if (existing) {
        filmId = existing.id;
        // Update with any new TMDB data
        await db
          .update(schema.films)
          .set({
            tmdbId: film.tmdbId ?? undefined,
            posterUrl: film.posterUrl ?? undefined,
            genres: film.genres ?? undefined,
          })
          .where(eq(schema.films.id, filmId));
      } else {
        const [inserted] = await db
          .insert(schema.films)
          .values({
            title: film.title,
            director: film.director,
            year: film.year,
            tmdbId: film.tmdbId ?? null,
            posterUrl: film.posterUrl ?? null,
            genres: film.genres ?? [],
          })
          .returning({ id: schema.films.id });
        filmId = inserted.id;
      }

      // Enqueue a batch_job for the Python batch worker (SKIP LOCKED)
      await db.insert(schema.batchJobs).values({
        filmId,
        status: "pending",
      });

      // Also enqueue a pipeline_job for backward compat with TS worker
      await enqueueJob(filmId, "detect", undefined, {
        sourceUrl: film.sourceUrl,
        batchId,
      });

      filmsQueued++;
    }

    return NextResponse.json({ batchId, filmsQueued });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch submission failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
