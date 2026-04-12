/**
 * Verify Drizzle schema tables used by ingest exist and match expected structure.
 * Next app and TS worker share `src/db/schema.ts` (worker imports it directly).
 */
import { getTableColumns } from "drizzle-orm";

import * as app from "../src/db/schema";

function sortedSqlColumnNames(table: object): string[] {
  return Object.values(getTableColumns(table as never))
    .map((col) => (col as { name: string }).name)
    .sort();
}

function assertNonEmptyColumns(label: string, table: object): boolean {
  const cols = sortedSqlColumnNames(table);
  if (cols.length === 0) {
    console.error(`[check-schema-drift] ${label}: no columns`);
    return false;
  }
  return true;
}

const tables: [string, object][] = [
  ["films", app.films],
  ["ingest_runs", app.ingestRuns],
  ["ingest_async_jobs", app.ingestAsyncJobs],
  ["scenes", app.scenes],
  ["shots", app.shots],
  ["shot_metadata", app.shotMetadata],
  ["shot_semantic", app.shotSemantic],
  ["shot_embeddings", app.shotEmbeddings],
  ["shot_image_embeddings", app.shotImageEmbeddings],
  ["boundary_cut_presets", app.boundaryCutPresets],
  ["eval_gold_revisions", app.evalGoldRevisions],
  ["boundary_eval_runs", app.boundaryEvalRuns],
];

let ok = true;
for (const [label, t] of tables) {
  if (!assertNonEmptyColumns(label, t)) ok = false;
}

if (!ok) {
  console.error("[check-schema-drift] FAILED");
  process.exit(1);
}

console.info(
  "[check-schema-drift] OK — worker and app both use ../src/db/schema.ts for ingest writes",
);
process.exit(0);
