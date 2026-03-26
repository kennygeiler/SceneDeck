export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { getAllShots } from "@/db/queries";
import { validateApiKey } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  try {
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20)));

    const filters: Record<string, string> = {};
    const framing = request.nextUrl.searchParams.get("framing");
    const director = request.nextUrl.searchParams.get("director");
    const filmTitle = request.nextUrl.searchParams.get("filmTitle");
    const shotSize = request.nextUrl.searchParams.get("shotSize");

    if (framing) filters.framing = framing;
    if (director) filters.director = director;
    if (filmTitle) filters.filmTitle = filmTitle;
    if (shotSize) filters.shotSize = shotSize;

    const shots = await getAllShots(
      Object.keys(filters).length > 0 ? filters : undefined,
    );

    const start = (page - 1) * limit;
    const paginated = shots.slice(start, start + limit).map((s) => ({
      id: s.id,
      filmTitle: s.film.title,
      director: s.film.director,
      year: s.film.year,
      framing: s.metadata.framing,
      depth: s.metadata.depth,
      blocking: s.metadata.blocking,
      shotSize: s.metadata.shotSize,
      angleVertical: s.metadata.angleVertical,
      angleHorizontal: s.metadata.angleHorizontal,
      duration: s.duration,
      startTc: s.startTc,
      endTc: s.endTc,
      description: s.semantic?.description ?? null,
      mood: s.semantic?.mood ?? null,
      thumbnailUrl: s.thumbnailUrl,
      videoUrl: s.videoUrl,
    }));

    return Response.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: shots.length,
        totalPages: Math.ceil(shots.length / limit),
      },
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch shots" },
      { status: 500 },
    );
  }
}
