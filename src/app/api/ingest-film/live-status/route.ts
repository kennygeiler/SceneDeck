import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";

/**
 * Poll film + shot counts while ingest SSE may be stalled (proxy/browser drops).
 * Does not expose sensitive data — same title/year as the ingest form.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim();
  const yearRaw = searchParams.get("year")?.trim();
  if (!title || !yearRaw) {
    return NextResponse.json({ error: "title and year are required" }, { status: 400 });
  }
  const year = Number(yearRaw);
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "year must be an integer" }, { status: 400 });
  }

  const [film] = await db
    .select({ id: schema.films.id })
    .from(schema.films)
    .where(and(eq(schema.films.title, title), eq(schema.films.year, year)))
    .limit(1);

  if (!film) {
    return NextResponse.json({ found: false as const });
  }

  const [shotRow] = await db
    .select({ c: count() })
    .from(schema.shots)
    .where(eq(schema.shots.filmId, film.id));

  const [sceneRow] = await db
    .select({ c: count() })
    .from(schema.scenes)
    .where(eq(schema.scenes.filmId, film.id));

  return NextResponse.json({
    found: true as const,
    filmId: film.id,
    shotCount: Number(shotRow?.c ?? 0),
    sceneCount: Number(sceneRow?.c ?? 0),
  });
}
