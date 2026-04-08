import type { FilmWithDetails } from "@/lib/types";

export type FilmEvalExportPayload = {
  schemaVersion: "1.0";
  source: "metrovision_db_export";
  filmId: string;
  filmTitle: string;
  cutsSec: number[];
  shots: Array<{
    startSec: number;
    endSec: number;
    framing: string;
    shotSize: string | null;
  }>;
};

/** Same shape as `pnpm eval:export-film` — single source for CLI + API + UI download. */
export function buildFilmEvalExportPayload(film: FilmWithDetails): FilmEvalExportPayload {
  const shots = film.scenes
    .flatMap((s) => s.shots)
    .sort((a, b) => (a.startTc ?? 0) - (b.startTc ?? 0));

  const cutsSec: number[] = [];
  for (let i = 1; i < shots.length; i++) {
    const st = shots[i]!.startTc;
    if (st != null && Number.isFinite(st)) {
      cutsSec.push(Math.round(st * 1000) / 1000);
    }
  }

  const shotSegments = shots.map((sh) => ({
    startSec: sh.startTc ?? 0,
    endSec: sh.endTc ?? 0,
    framing: String(sh.metadata.framing),
    shotSize: sh.metadata.shotSize != null ? String(sh.metadata.shotSize) : null,
  }));

  return {
    schemaVersion: "1.0",
    source: "metrovision_db_export",
    filmId: film.id,
    filmTitle: film.title,
    cutsSec,
    shots: shotSegments,
  };
}
