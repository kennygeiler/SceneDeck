import { NextResponse } from "next/server";

import { getFilmReclassifyTargets } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getFilmReclassifyTargets(id);
  if (!data) {
    return NextResponse.json({ error: "Film not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
