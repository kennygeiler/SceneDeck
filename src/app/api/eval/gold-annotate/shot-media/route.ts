export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getShotClipUrlsById } from "@/db/queries";

/** One-shot clip URLs for gold-annotate workspace (not bulk export). */
export async function GET(request: Request) {
  const shotId = new URL(request.url).searchParams.get("shotId")?.trim();
  if (!shotId) {
    return NextResponse.json({ error: "shotId is required" }, { status: 400 });
  }

  const urls = await getShotClipUrlsById(shotId);
  if (!urls) {
    return NextResponse.json({ error: "Shot not found" }, { status: 404 });
  }

  return NextResponse.json(urls);
}
