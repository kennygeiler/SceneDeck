import { db, schema } from "@/db";
import {
  buildShotSearchText,
  generateTextEmbedding,
} from "@/db/embeddings";
import { getAllShots } from "@/db/queries";

async function main() {
  const shots = await getAllShots();
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  if (shots.length === 0) {
    console.info("No shots found. Nothing to embed.");
    return;
  }

  for (const [index, shot] of shots.entries()) {
    const searchText = buildShotSearchText(shot);
    const embedding = await generateTextEmbedding(searchText, apiKey);

    await db
      .insert(schema.shotEmbeddings)
      .values({
        shotId: shot.id,
        embedding,
        searchText,
      })
      .onConflictDoUpdate({
        target: schema.shotEmbeddings.shotId,
        set: {
          embedding,
          searchText,
        },
      });

    console.info(
      `[${index + 1}/${shots.length}] Embedded "${shot.film.title}" (${shot.id}).`,
    );
  }

  console.info(`Generated embeddings for ${shots.length} shots.`);
}

main().catch((error) => {
  console.error("Failed to generate shot embeddings.", error);
  process.exitCode = 1;
});
