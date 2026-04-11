export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { getBoundaryCutPresetById, setFilmBoundaryCutPreset } from "@/db/boundary-tuning-queries";
import { db } from "@/db";
import { films } from "@/db/schema";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id: filmId } = await ctx.params;

  const [film] = await db.select({ id: films.id }).from(films).where(eq(films.id, filmId)).limit(1);
  if (!film) return Response.json({ error: "Film not found" }, { status: 404 });

  try {
    const body = (await request.json()) as { boundaryCutPresetId?: string | null };
    if (!("boundaryCutPresetId" in body)) {
      return Response.json({ error: "boundaryCutPresetId required (or null)" }, { status: 400 });
    }
    const pid = body.boundaryCutPresetId;
    if (pid != null) {
      if (typeof pid !== "string" || !pid.trim()) {
        return Response.json({ error: "Invalid boundaryCutPresetId" }, { status: 400 });
      }
      const preset = await getBoundaryCutPresetById(pid.trim());
      if (!preset) return Response.json({ error: "Preset not found" }, { status: 404 });
    }

    const row = await setFilmBoundaryCutPreset(filmId, pid == null ? null : String(pid).trim());
    return Response.json({ film: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
