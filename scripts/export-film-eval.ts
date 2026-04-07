/**
 * Export DB shot timings + taxonomy for boundary / slot evaluation.
 *
 *   pnpm eval:export-film -- <filmUuid> [output.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getFilmById } from "@/db/queries";

async function main() {
  const filmId = process.argv[2];
  const outArg = process.argv[3];
  if (!filmId) {
    console.error("Usage: pnpm eval:export-film -- <filmId> [output.json]");
    process.exit(1);
  }

  const film = await getFilmById(filmId);
  if (!film) {
    console.error("Film not found:", filmId);
    process.exit(1);
  }

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
    framing: sh.metadata.framing,
    shotSize: sh.metadata.shotSize,
  }));

  const payload = {
    schemaVersion: "1.0",
    source: "metrovision_db_export",
    filmId: film.id,
    filmTitle: film.title,
    cutsSec,
    shots: shotSegments,
  };

  const outPath =
    outArg ?? path.join("eval", "predicted", `${film.id}.json`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.info(
    `Wrote ${outPath} (${shots.length} shots, ${cutsSec.length} interior cuts).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
