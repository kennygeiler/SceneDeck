import { NextResponse } from "next/server";
import { getPresignedUrl, getPresignedPutUrl, buildS3Key } from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST: Get presigned URLs for direct browser → S3 upload.
 * The browser PUTs the file directly to S3 (no proxy through Next.js).
 * Returns both a PUT URL (for upload) and a GET URL (for the worker to download).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, fileType, filmTitle, year } = body;

    if (!fileName || !filmTitle) {
      return NextResponse.json({ error: "fileName and filmTitle are required." }, { status: 400 });
    }

    const sanitizedTitle = (filmTitle ?? "film").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const filmSlug = `${sanitizedTitle}-${year ?? "unknown"}`;
    const sanitizedName = (fileName as string).replace(/[^a-zA-Z0-9._-]/g, "_");
    const s3Key = buildS3Key(filmSlug, "source", `${Date.now()}-${sanitizedName}`);

    const [putUrl, getUrl] = await Promise.all([
      getPresignedPutUrl(s3Key, fileType || "video/mp4", 3600),
      getPresignedUrl(s3Key, 21600), // 6 hour GET expiry for worker
    ]);

    return NextResponse.json({
      s3Key,
      putUrl,      // Browser uploads directly here
      videoUrl: getUrl,  // Worker downloads from here
      fileName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
