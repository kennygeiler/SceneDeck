export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getFilmById } from "@/db/queries";
import { buildFilmEvalExportPayload } from "@/lib/film-eval-export";

export async function GET(request: Request) {
  const filmId = new URL(request.url).searchParams.get("filmId");
  if (!filmId) {
    return NextResponse.json({ error: "filmId is required" }, { status: 400 });
  }

  const film = await getFilmById(filmId);
  if (!film) {
    return NextResponse.json({ error: "Film not found" }, { status: 404 });
  }

  const shots = film.scenes
    .flatMap((s) => s.shots)
    .sort((a, b) => (a.startTc ?? 0) - (b.startTc ?? 0));

  return NextResponse.json({
    film: {
      id: film.id,
      title: film.title,
      director: film.director,
      year: film.year,
    },
    shots: shots.map((s, index) => ({
      index: index + 1,
      id: s.id,
      startTc: s.startTc,
      endTc: s.endTc,
      duration: s.duration,
      videoUrl: s.videoUrl,
      framing: s.metadata.framing,
    })),
    /** Same JSON as `pnpm eval:export-film` — for in-app download + compare. */
    predictedExport: buildFilmEvalExportPayload(film),
  });
}
