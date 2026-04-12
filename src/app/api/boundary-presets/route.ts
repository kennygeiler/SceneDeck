export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  getBoundaryCutPresetById,
  getBoundaryEvalRunById,
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
  const forIngest =
    request.nextUrl.searchParams.get("forIngest") === "1" ||
    request.nextUrl.searchParams.get("forCommunityIngest") === "1";
  const rows = await listBoundaryCutPresets(includeArchived, {
    forCommunityIngest: forIngest,
  });
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
      let sourceEvalRunId: string | null = null;
      if (typeof body.sourceEvalRunId === "string" && body.sourceEvalRunId.trim()) {
        const run = await getBoundaryEvalRunById(body.sourceEvalRunId.trim());
        if (!run) {
          return Response.json({ error: "sourceEvalRunId not found" }, { status: 404 });
        }
        sourceEvalRunId = run.id;
      }
      const shareWithCommunity =
        body.shareWithCommunity === false || body.shareWithCommunity === 0
          ? false
          : true;
      const contributorLabel =
        typeof body.contributorLabel === "string" && body.contributorLabel.trim()
          ? body.contributorLabel.trim()
          : null;
      let validatedF1: number | null = null;
      if (body.validatedF1 !== undefined && body.validatedF1 !== null) {
        const f = Number(body.validatedF1);
        if (Number.isFinite(f)) validatedF1 = f;
      }
      const descExtra =
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null;
      const mergedDescription = [src.description, descExtra].filter(Boolean).join("\n\n") || null;
      const row = await insertBoundaryCutPreset({
        name,
        slug: null,
        description: mergedDescription,
        config: parseBoundaryCutPresetConfig(src.config),
        isSystem: false,
        shareWithCommunity,
        contributorLabel,
        validatedF1,
        sourceEvalRunId,
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

    const shareWithCommunity =
      body.shareWithCommunity === false || body.shareWithCommunity === 0 ? false : true;
    const contributorLabel =
      typeof body.contributorLabel === "string" && body.contributorLabel.trim()
        ? body.contributorLabel.trim()
        : null;

    const row = await insertBoundaryCutPreset({
      name,
      slug,
      description,
      config,
      isSystem: false,
      shareWithCommunity,
      contributorLabel,
    });
    return Response.json({ preset: row }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
