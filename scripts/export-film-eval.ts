/**
 * Export DB shot timings + taxonomy for boundary / slot evaluation.
 *
 *   pnpm eval:export-film -- <filmUuid> [output.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getFilmById } from "@/db/queries";
import { buildFilmEvalExportPayload } from "@/lib/film-eval-export";

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

  const payload = buildFilmEvalExportPayload(film);
  const shotCount = film.scenes.reduce((n, s) => n + s.shots.length, 0);

  const outPath =
    outArg ?? path.join("eval", "predicted", `${film.id}.json`);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.info(
    `Wrote ${outPath} (${shotCount} shots, ${payload.cutsSec.length} interior cuts).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
