import {
  forwardIngestFilmJobStatusToWorker,
  resolveIngestWorkerProxyTarget,
} from "@/lib/ingest-worker-delegate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("t")?.trim() ?? "";
  if (!token) {
    return new Response(JSON.stringify({ error: "Query parameter t (poll token) is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ingestWorker = resolveIngestWorkerProxyTarget();
  if (ingestWorker) {
    return forwardIngestFilmJobStatusToWorker(ingestWorker, id, token);
  }

  if (process.env.VERCEL === "1" && process.env.METROVISION_DELEGATE_INGEST !== "0") {
    return new Response(
      JSON.stringify({
        error:
          "Job status requires INGEST_WORKER_URL or NEXT_PUBLIC_WORKER_URL (poll endpoint is served by the TS worker).",
      }),
      { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  return new Response(
    JSON.stringify({
      error: "Set INGEST_WORKER_URL to poll async ingest jobs.",
    }),
    { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
