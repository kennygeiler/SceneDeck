/**
 * Wipe all film / scene / shot–derived rows (and related jobs, embeddings, verifications).
 *
 * Does NOT clear: api_keys, corpus_chunks (RAG) — run SQL in Neon for those if needed.
 *
 *   CONFIRM_CLEAR=yes pnpm db:clear
 */
import { sql } from "drizzle-orm";

import { db } from "../src/db/index";

async function main() {
  if (process.env.CONFIRM_CLEAR !== "yes") {
    console.error(
      "Refusing to run: set CONFIRM_CLEAR=yes to truncate the film graph (destructive).",
    );
    process.exit(1);
  }

  await db.execute(sql`TRUNCATE TABLE films RESTART IDENTITY CASCADE`);

  console.info("Truncated films and dependent rows (CASCADE).");
  console.info("Unchanged: api_keys, corpus_chunks — delete separately if you want a full wipe.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
