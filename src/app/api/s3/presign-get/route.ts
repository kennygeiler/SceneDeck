import { NextResponse } from "next/server";

import { getPresignedUrl } from "@/lib/s3";
import { normalizeS3SourceReuseInput } from "@/lib/s3-source-reuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GET_EXPIRY_SEC = 86_400; // 24h — long enough for worker ingest / FFmpeg

/**
 * Keys from browser uploads follow `films/{slug}/source/{filename}` (see buildS3Key).
 * Reject traversal; allow any non-empty path segments (Unicode filenames, etc.).
 */
function isAllowedSourceReuseKey(key: string): boolean {
  const k = key.trim();
  if (!k || k.length > 1024 || k.includes("..") || k.startsWith("/")) return false;
  const parts = k.split("/").filter((p) => p.length > 0);
  if (parts.length < 4) return false;
  if (parts[0] !== "films" || parts[2] !== "source") return false;
  if (parts.some((p) => p === "." || p === "..")) return false;
  return Boolean(parts[1]) && Boolean(parts.slice(3).join("/"));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { key?: string };
    const raw = typeof body.key === "string" ? body.key : "";
    const key = normalizeS3SourceReuseInput(raw);
    if (!key) {
      return NextResponse.json({ error: "key is required." }, { status: 400 });
    }
    if (!isAllowedSourceReuseKey(key)) {
      return NextResponse.json(
        {
          error:
            "Could not parse a valid S3 key. Paste the object key (films/…/source/…), a full S3 URL, or JSON with s3Key from the upload response.",
          normalizedKey: key.slice(0, 200),
        },
        { status: 400 },
      );
    }

    const videoUrl = await getPresignedUrl(key, GET_EXPIRY_SEC);
    return NextResponse.json({ videoUrl, key, expiresIn: GET_EXPIRY_SEC });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to presign GET";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
