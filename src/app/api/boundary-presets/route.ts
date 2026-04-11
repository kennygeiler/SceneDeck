export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  getBoundaryCutPresetById,
  insertBoundaryCutPreset,
  listBoundaryCutPresets,
} from "@/db/boundary-tuning-queries";
import {
  DEFAULT_BOUNDARY_CUT_PRESET_CONFIG,
  parseBoundaryCutPresetConfig,
} from "@/lib/boundary-cut-preset";

export async function GET(request: NextRequest) {
  const includeArchived =
    request.nextUrl.searchParams.get("includeArchived") === "1";
  const rows = await listBoundaryCutPresets(includeArchived);
  return Response.json({ presets: rows });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.duplicateFromId && typeof body.duplicateFromId === "string") {
      const src = await getBoundaryCutPresetById(body.duplicateFromId);
      if (!src) {
        return Response.json({ error: "Source preset not found" }, { status: 404 });
      }
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : `${src.name} (copy)`;
      const row = await insertBoundaryCutPreset({
        name,
        slug: null,
        description: src.description,
        config: parseBoundaryCutPresetConfig(src.config),
      });
      return Response.json({ preset: row }, { status: 201 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const configRaw = body.config ?? DEFAULT_BOUNDARY_CUT_PRESET_CONFIG;
    const config = parseBoundaryCutPresetConfig(configRaw);
    const slug =
      typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : null;
    const description =
      typeof body.description === "string" ? body.description : null;

    const row = await insertBoundaryCutPreset({
      name,
      slug,
      description,
      config,
    });
    return Response.json({ preset: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
