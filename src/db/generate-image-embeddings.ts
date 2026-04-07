import { db, schema } from "@/db";
import { generateImageEmbeddingFromUrl } from "@/lib/image-embedding";
import { getAllShots } from "@/db/queries";

function absoluteThumbnailUrl(thumbnailUrl: string | null): string | null {
  if (!thumbnailUrl?.trim()) return null;
  const t = thumbnailUrl.trim();
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    console.warn(
      "[image-embeddings] NEXT_PUBLIC_SITE_URL is unset; cannot resolve relative thumbnail URLs for Replicate.",
    );
    return null;
  }
  return `${base}${t.startsWith("/") ? "" : "/"}${t}`;
}

async function main() {
  const shots = await getAllShots();

  if (shots.length === 0) {
    console.info("No shots found. Nothing to embed.");
    return;
  }

  let ok = 0;
  let skipped = 0;

  for (const [index, shot] of shots.entries()) {
    const url = absoluteThumbnailUrl(shot.thumbnailUrl);
    if (!url) {
      skipped++;
      continue;
    }

    await new Promise((r) => setTimeout(r, 400));

    try {
      const { embedding, model } = await generateImageEmbeddingFromUrl(url);
      await db
        .insert(schema.shotImageEmbeddings)
        .values({
          shotId: shot.id,
          embedding,
          model,
        })
        .onConflictDoUpdate({
          target: schema.shotImageEmbeddings.shotId,
          set: { embedding, model },
        });
      ok++;
      console.info(
        `[${index + 1}/${shots.length}] Image embedded "${shot.film.title}" (${shot.id}).`,
      );
    } catch (e) {
      console.warn(
        `[${index + 1}/${shots.length}] Skip shot ${shot.id}:`,
        e instanceof Error ? e.message : e,
      );
      skipped++;
    }
  }

  console.info(
    `Image embeddings complete: ${ok} written, ${skipped} skipped or failed.`,
  );
}

main().catch((error) => {
  console.error("Failed to generate image embeddings.", error);
  process.exitCode = 1;
});
