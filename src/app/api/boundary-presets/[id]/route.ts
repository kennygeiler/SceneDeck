export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  getBoundaryCutPresetById,
  updateBoundaryCutPreset,
} from "@/db/boundary-tuning-queries";
import { parseBoundaryCutPresetConfig } from "@/lib/boundary-cut-preset";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const preset = await getBoundaryCutPresetById(id);
  if (!preset) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ preset });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = await getBoundaryCutPresetById(id);
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateBoundaryCutPreset>[1] = {};
    if (typeof body.name === "string") patch.name = body.name.trim();
    if (body.slug !== undefined) {
      patch.slug =
        body.slug === null || body.slug === ""
          ? null
          : String(body.slug).trim();
    }
    if (body.description !== undefined) {
      patch.description =
        body.description === null ? null : String(body.description);
    }
    if (body.config !== undefined) {
      patch.config = parseBoundaryCutPresetConfig(body.config);
    }
    if (typeof body.isArchived === "boolean") patch.isArchived = body.isArchived;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: "No valid fields" }, { status: 400 });
    }

    const preset = await updateBoundaryCutPreset(id, patch);
    return Response.json({ preset });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
