import {
  forwardIngestFilmAsyncToWorker,
  resolveIngestWorkerProxyTarget,
} from "@/lib/ingest-worker-delegate";
import { parseIngestTimelineFromBody } from "@/lib/ingest-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const bodyText = await request.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if ((!body.videoPath && !body.videoUrl) || !body.filmTitle || !body.director || !body.year) {
    return new Response(JSON.stringify({ error: "Missing required fields (videoPath or videoUrl)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    parseIngestTimelineFromBody(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid timeline fields";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ingestWorker = resolveIngestWorkerProxyTarget();
  if (ingestWorker) {
    return forwardIngestFilmAsyncToWorker(ingestWorker, bodyText);
  }

  if (process.env.VERCEL === "1" && process.env.METROVISION_DELEGATE_INGEST !== "0") {
    return new Response(
      JSON.stringify({
        error:
          "Background ingest requires INGEST_WORKER_URL or NEXT_PUBLIC_WORKER_URL (async jobs run on the TS worker and persist in Postgres).",
      }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  return new Response(
    JSON.stringify({
      error:
        "Background ingest is only supported when the app proxies to the TS worker. Set INGEST_WORKER_URL to your worker origin.",
    }),
    { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
