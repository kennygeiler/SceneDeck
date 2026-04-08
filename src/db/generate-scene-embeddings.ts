/**
 * Generate scene-level and film-level embeddings from existing shot data.
 * Aggregates shot descriptions within each scene/film for a higher-level embedding.
 *
 * Usage: pnpm embeddings:scenes
 */

import { sql } from "drizzle-orm";

import { db, schema } from "@/db";
import { loadLocalEnv } from "@/db/load-env";
import { generateTextEmbedding } from "@/db/embeddings";

loadLocalEnv();

async function generateSceneEmbeddings() {
  console.log("Generating scene-level embeddings...");

  const scenes = await db.execute(sql`
    SELECT
      sc.id AS scene_id,
      sc.title AS scene_title,
      sc.description AS scene_desc,
      sc.location,
      f.title AS film_title,
      f.director,
      array_agg(ss.description) FILTER (WHERE ss.description IS NOT NULL) AS shot_descriptions,
      array_agg(DISTINCT sm.framing) FILTER (WHERE sm.framing IS NOT NULL) AS framing_slugs
    FROM scenes sc
    JOIN films f ON f.id = sc.film_id
    LEFT JOIN shots s ON s.scene_id = sc.id
    LEFT JOIN shot_semantic ss ON ss.shot_id = s.id
    LEFT JOIN shot_metadata sm ON sm.shot_id = s.id
    GROUP BY sc.id, sc.title, sc.description, sc.location, f.title, f.director
  `);

  let count = 0;
  for (const row of scenes.rows as Record<string, unknown>[]) {
    const descriptions = ((row.shot_descriptions as string[]) ?? []).slice(0, 10);
    const framings = [...new Set(((row.framing_slugs as string[]) ?? []))];

    const searchText = [
      row.film_title,
      row.director,
      row.scene_title ?? "",
      row.scene_desc ?? "",
      row.location ?? "",
      framings.length > 0 ? `Shot framings: ${framings.join(", ")}` : "",
      ...descriptions,
    ]
      .filter(Boolean)
      .join(" ");

    if (searchText.trim().length < 20) continue;

    const embedding = await generateTextEmbedding(searchText);

    await db
      .insert(schema.sceneEmbeddings)
      .values({
        sceneId: row.scene_id as string,
        embedding,
        searchText,
      })
      .onConflictDoUpdate({
        target: schema.sceneEmbeddings.sceneId,
        set: { embedding, searchText },
      });

    count++;
    if (count % 10 === 0) console.log(`  ${count} scenes embedded...`);
  }

  console.log(`✓ ${count} scene embeddings generated.`);
}

async function generateFilmEmbeddings() {
  console.log("Generating film-level embeddings...");

  const films = await db.execute(sql`
    SELECT
      f.id AS film_id,
      f.title,
      f.director,
      f.year,
      f.overview,
      array_to_string(f.genres, ', ') AS genres,
      COUNT(DISTINCT s.id) AS shot_count,
      array_agg(DISTINCT sm.framing) FILTER (WHERE sm.framing IS NOT NULL) AS framing_slugs,
      array_agg(DISTINCT sm.shot_size) FILTER (WHERE sm.shot_size IS NOT NULL) AS shot_sizes
    FROM films f
    LEFT JOIN shots s ON s.film_id = f.id
    LEFT JOIN shot_metadata sm ON sm.shot_id = s.id
    GROUP BY f.id
  `);

  let count = 0;
  for (const row of films.rows as Record<string, unknown>[]) {
    const framings = ((row.framing_slugs as string[]) ?? []).filter(Boolean);
    const sizes = ((row.shot_sizes as string[]) ?? []).filter(Boolean);

    const searchText = [
      row.title,
      row.director,
      row.year ? `(${row.year})` : "",
      row.genres ?? "",
      row.overview ?? "",
      framings.length > 0 ? `Shot framings: ${framings.join(", ")}` : "",
      sizes.length > 0 ? `Shot sizes: ${sizes.join(", ")}` : "",
      `${row.shot_count} shots analyzed`,
    ]
      .filter(Boolean)
      .join(" ");

    const embedding = await generateTextEmbedding(searchText);

    await db
      .insert(schema.filmEmbeddings)
      .values({
        filmId: row.film_id as string,
        embedding,
        searchText,
      })
      .onConflictDoUpdate({
        target: schema.filmEmbeddings.filmId,
        set: { embedding, searchText },
      });

    count++;
    if (count % 5 === 0) console.log(`  ${count} films embedded...`);
  }

  console.log(`✓ ${count} film embeddings generated.`);
}

async function main() {
  await generateSceneEmbeddings();
  await generateFilmEmbeddings();
  console.log("\nAll multi-granularity embeddings complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Embedding generation failed:", err);
  process.exit(1);
});
