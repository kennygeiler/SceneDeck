/**
 * Compare SQL column names for tables shared between Next app and TS worker.
 * Exits 1 if films, scenes, shots, shot_semantic, or shot_embeddings differ.
 * Always warns about shot_metadata (known divergence — see CONCERNS.md).
 */
import { getTableColumns } from "drizzle-orm";

import * as app from "../src/db/schema";
import * as worker from "../worker/src/schema";

function sortedSqlColumnNames(table: object): string[] {
  return Object.values(getTableColumns(table as never))
    .map((col) => (col as { name: string }).name)
    .sort();
}

function comparePair(label: string, appTable: object, workerTable: object): boolean {
  const a = sortedSqlColumnNames(appTable);
  const w = sortedSqlColumnNames(workerTable);
  if (a.length !== w.length || a.some((v, i) => v !== w[i])) {
    console.error(`[check-schema-drift] Column mismatch: ${label}`);
    console.error(`  app:    ${a.join(", ")}`);
    console.error(`  worker: ${w.join(", ")}`);
    return false;
  }
  return true;
}

const pairs: [string, object, object][] = [
  ["films", app.films, worker.films],
  ["scenes", app.scenes, worker.scenes],
  ["shots", app.shots, worker.shots],
  ["shot_semantic", app.shotSemantic, worker.shotSemantic],
  ["shot_embeddings", app.shotEmbeddings, worker.shotEmbeddings],
];

let ok = true;
for (const [label, a, w] of pairs) {
  if (!comparePair(label, a, w)) ok = false;
}

console.warn(
  "[check-schema-drift] shot_metadata: app uses composition taxonomy columns; worker still uses legacy movement columns. " +
    "Tracked in .planning/codebase/CONCERNS.md until worker ingest migrates. (Not compared here.)",
);

if (!ok) {
  console.error("[check-schema-drift] FAILED");
  process.exit(1);
}

console.info("[check-schema-drift] OK — shared tables match");
process.exit(0);
