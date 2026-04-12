import { eq } from "drizzle-orm";

import { db } from "@/db";
import { boundaryCutPresets, films } from "@/db/schema";
import {
  DEFAULT_BOUNDARY_CUT_PRESET_CONFIG,
  DEFAULT_BOUNDARY_CUT_PRESET_SLUG,
} from "@/lib/boundary-cut-preset";

async function main() {
  const [presetRow] = await db
    .select({ id: boundaryCutPresets.id })
    .from(boundaryCutPresets)
    .where(eq(boundaryCutPresets.slug, DEFAULT_BOUNDARY_CUT_PRESET_SLUG))
    .limit(1);

  if (!presetRow) {
    await db.insert(boundaryCutPresets).values({
      name: "Cemented (Ran baseline)",
      slug: DEFAULT_BOUNDARY_CUT_PRESET_SLUG,
      description:
        "Matches eval/runs/STATUS.md CEMENTED row — ensemble + merge gap 0.22.",
      config: DEFAULT_BOUNDARY_CUT_PRESET_CONFIG,
      isSystem: true,
      shareWithCommunity: true,
    });
    console.info("Seed: inserted default boundary_cut_presets row.");
  }

  const existing = await db
    .select({ id: films.id })
    .from(films)
    .where(eq(films.title, "Seed (dev)"))
    .limit(1);

  if (existing.length > 0) {
    console.info("Seed skipped: dev film already exists.");
    return;
  }

  await db.insert(films).values({
    title: "Seed (dev)",
    director: "MetroVision",
    year: 1970,
  });

  console.info("Seed complete: inserted dev film.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
