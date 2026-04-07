import { NextResponse } from "next/server";

import { getVisuallySimilarShots } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const raw = Number(url.searchParams.get("limit") ?? "12");
  const limit = Number.isFinite(raw) ? raw : 12;

  const similar = await getVisuallySimilarShots(id, limit);

  return NextResponse.json({
    shotId: id,
    count: similar.length,
    similar,
  });
}
