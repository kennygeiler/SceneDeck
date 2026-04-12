export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  getBoundaryCutPresetById,
  getBoundaryEvalRunById,
  updateBoundaryCutPreset,
} from "@/db/boundary-tuning-queries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id?.trim() || !UUID_RE.test(id.trim())) {
    return Response.json({ error: "Invalid preset id" }, { status: 400 });
  }

  const existing = await getBoundaryCutPresetById(id.trim());
  if (!existing) {
    return Response.json({ error: "Preset not found" }, { status: 404 });
  }

  if (existing.isSystem) {
    return Response.json(
      { error: "System presets cannot be modified via this route" },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const patch: Parameters<typeof updateBoundaryCutPreset>[1] = {};

    if (typeof body.name === "string" && body.name.trim()) {
      patch.name = body.name.trim();
    }
    if (body.description === null) {
      patch.description = null;
    } else if (typeof body.description === "string") {
      patch.description = body.description.trim() || null;
    }
    if (body.shareWithCommunity === true || body.shareWithCommunity === false) {
      patch.shareWithCommunity = body.shareWithCommunity;
    }
    if (body.contributorLabel === null) {
      patch.contributorLabel = null;
    } else if (typeof body.contributorLabel === "string") {
      patch.contributorLabel = body.contributorLabel.trim() || null;
    }
    if (body.validatedF1 === null) {
      patch.validatedF1 = null;
    } else if (body.validatedF1 !== undefined) {
      const f = Number(body.validatedF1);
      if (Number.isFinite(f)) patch.validatedF1 = f;
    }
    if (body.sourceEvalRunId === null) {
      patch.sourceEvalRunId = null;
    } else if (typeof body.sourceEvalRunId === "string" && body.sourceEvalRunId.trim()) {
      const rid = body.sourceEvalRunId.trim();
      const run = await getBoundaryEvalRunById(rid);
      if (!run) {
        return Response.json({ error: "sourceEvalRunId not found" }, { status: 404 });
      }
      patch.sourceEvalRunId = rid;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { error: "No valid fields to update (name, description, shareWithCommunity, contributorLabel, validatedF1, sourceEvalRunId)" },
        { status: 400 },
      );
    }

    const row = await updateBoundaryCutPreset(id.trim(), patch);
    if (!row) {
      return Response.json({ error: "Update failed" }, { status: 500 });
    }
    return Response.json({ preset: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
