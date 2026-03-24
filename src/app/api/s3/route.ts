import { NextResponse } from "next/server";

import { getPresignedUrl } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/s3?key=films/slug/clips/shot-001.mp4
 * Returns a redirect to a presigned S3 URL (1 hour expiry).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "key parameter is required" }, { status: 400 });
  }

  try {
    const url = await getPresignedUrl(key, 3600);
    return NextResponse.redirect(url, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate presigned URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
