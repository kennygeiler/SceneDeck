/**
 * Offload the full ingest SSE pipeline to the long-running TS worker (Express + PySceneDetect + real disk).
 * Set `INGEST_WORKER_URL` (server-only) or `NEXT_PUBLIC_WORKER_URL` on Vercel so `/api/ingest-film/stream`
 * proxies to the worker — the browser only talks to your Next app (no CORS, one deployment story).
 *
 * Disable: `METROVISION_DELEGATE_INGEST=0`
 */

import { workerIngestHeadersForProxy } from "@/lib/worker-route-secret";

const PROXY_TIMEOUT_MS = 890_000;

/**
 * Worker env should be **origin only** (e.g. `https://metrovision-worker.fly.dev`).
 * Accepts pasted full URLs like `…/api/ingest-film/stream` and reduces to **origin** so callers
 * don't double-append `/api/ingest-film/stream` (that yields Next's HTML 404 during ingest).
 */
export function normalizeWorkerOrigin(raw: string): string {
  const t = raw.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    /* fall through */
  }
  let s = t;
  if (s.endsWith("/api")) s = s.slice(0, -4).replace(/\/+$/, "");
  return s;
}

export function resolveIngestWorkerProxyTarget(): string | null {
  if (process.env.METROVISION_DELEGATE_INGEST === "0") return null;
  const base =
    process.env.INGEST_WORKER_URL?.trim() || process.env.NEXT_PUBLIC_WORKER_URL?.trim();
  if (!base) return null;
  return normalizeWorkerOrigin(base);
}

function proxyFailureResponse(url: string, message: string, hint: string): Response {
  const body = JSON.stringify({
    error: `Ingest worker proxy failed: ${message}${hint}`,
    proxyTarget: url,
  });
  return new Response(body, {
    status: 502,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** POST body must already be validated; forwards JSON as-is and streams the SSE response back. */
export async function forwardIngestFilmStreamToWorker(
  workerOrigin: string,
  bodyText: string,
): Promise<Response> {
  const origin = normalizeWorkerOrigin(workerOrigin);
  const url = `${origin}/api/ingest-film/stream`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), PROXY_TIMEOUT_MS);
  const hint =
    " Check INGEST_WORKER_URL / NEXT_PUBLIC_WORKER_URL: use the worker **origin** only (https://host.tld), no /api path. Verify GET {origin}/health returns JSON.";

  try {
    let workerRes: Response;
    try {
      workerRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...workerIngestHeadersForProxy(),
        },
        body: bodyText,
        signal: ac.signal,
      });
    } catch (err) {
      const e = err as Error & { cause?: { code?: string } };
      const name = e?.name ?? "Error";
      const msg = e?.message ?? String(err);
      const code =
        e?.cause && typeof e.cause === "object" && "code" in e.cause
          ? String((e.cause as { code?: string }).code)
          : "";
      const detail =
        name === "AbortError"
          ? `request timed out after ${PROXY_TIMEOUT_MS / 1000}s`
          : [msg, code].filter(Boolean).join(" ");
      return proxyFailureResponse(url, detail, hint);
    }

    if (workerRes.status === 404) {
      const t = await workerRes.text().catch(() => "");
      return proxyFailureResponse(
        url,
        `worker returned 404 — wrong URL or worker not deployed (${t.slice(0, 120)})`,
        hint,
      );
    }

    const headers = new Headers();
    const ct = workerRes.headers.get("Content-Type");
    if (ct) headers.set("Content-Type", ct);
    headers.set(
      "Cache-Control",
      workerRes.headers.get("Cache-Control") ?? "no-cache, no-transform",
    );
    headers.set("Connection", "keep-alive");
    headers.set("X-Accel-Buffering", "no");

    return new Response(workerRes.body, {
      status: workerRes.status,
      headers,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Enqueue background ingest on the worker; returns immediately with jobId + pollToken (no long-lived SSE). */
export async function forwardIngestFilmAsyncToWorker(
  workerOrigin: string,
  bodyText: string,
): Promise<Response> {
  const origin = normalizeWorkerOrigin(workerOrigin);
  const url = `${origin}/api/ingest-film/async`;
  const hint =
    " Check INGEST_WORKER_URL / NEXT_PUBLIC_WORKER_URL: use the worker **origin** only (https://host.tld), no /api path.";

  try {
    const workerRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...workerIngestHeadersForProxy(),
      },
      body: bodyText,
      signal: AbortSignal.timeout(60_000),
    });

    if (workerRes.status === 404) {
      const t = await workerRes.text().catch(() => "");
      return proxyFailureResponse(
        url,
        `worker returned 404 — async ingest not deployed? (${t.slice(0, 120)})`,
        hint,
      );
    }

    const text = await workerRes.text();
    return new Response(text, {
      status: workerRes.status,
      headers: { "Content-Type": workerRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    const e = err as Error;
    const detail = e?.name === "TimeoutError" ? "request timed out" : (e?.message ?? String(err));
    return proxyFailureResponse(url, detail, hint);
  }
}

/** Poll async ingest job status on the worker (short request). */
export async function forwardIngestFilmJobStatusToWorker(
  workerOrigin: string,
  jobId: string,
  pollToken: string,
): Promise<Response> {
  const origin = normalizeWorkerOrigin(workerOrigin);
  const url = `${origin}/api/ingest-film/jobs/${encodeURIComponent(jobId)}?t=${encodeURIComponent(pollToken)}`;

  try {
    const workerRes = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await workerRes.text();
    return new Response(text, {
      status: workerRes.status,
      headers: { "Content-Type": workerRes.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    const e = err as Error;
    const detail = e?.name === "TimeoutError" ? "request timed out" : (e?.message ?? String(err));
    return proxyFailureResponse(url, detail, "");
  }
}

/** GET {origin}/health — quick reachability check (Express worker exposes /health). */
export async function probeWorkerHealth(origin: string): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  workerBody?: { service?: string; status?: string };
}> {
  const base = normalizeWorkerOrigin(origin);
  const healthUrl = `${base}/health`;
  try {
    const r = await fetch(healthUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await r.text();
    let workerBody: { service?: string; status?: string } | undefined;
    try {
      workerBody = JSON.parse(text) as { service?: string; status?: string };
    } catch {
      /* ignore */
    }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: text.slice(0, 300),
      };
    }
    return { ok: true, status: r.status, workerBody };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      error: e.name === "TimeoutError" ? "timeout reaching worker /health" : e.message,
    };
  }
}
