/**
 * Ingest UI: avoid dumping multi‑KB HTML 404 pages into error panels when the stream URL is wrong.
 */

export function looksLikeHtmlDocument(s: string): boolean {
  const t = s.trimStart().slice(0, 800).toLowerCase();
  if (t.startsWith("<!doctype")) return true;
  if (t.startsWith("<html")) return true;
  if (/<\s*html[\s>]/.test(t)) return true;
  return false;
}

export function truncateIngestErrorBody(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}\n… (${t.length} characters total)`;
}

const HTML_INGEST_HINT =
  "The server returned an HTML page (often a 404 from the wrong host or a doubled /api path), not the ingest SSE endpoint. Use the worker origin only in NEXT_PUBLIC_WORKER_URL, confirm POST /api/ingest-film/stream exists on the target, and try NEXT_PUBLIC_INGEST_SSE_DIRECT=1 if the app is on Vercel.";

/** Body from a failed fetch(res) when !res.ok — never return raw Next.js not-found HTML. */
export function sanitizeIngestHttpErrorBody(status: number, body: string): string {
  const raw = body.trim();
  if (!raw) return `HTTP ${status}`;
  if (looksLikeHtmlDocument(raw)) {
    return `HTTP ${status}: ${HTML_INGEST_HINT}`;
  }
  return truncateIngestErrorBody(raw, 1200);
}

/** Collapsible troubleshooting text — strip HTML pages, cap very long blobs. */
export function sanitizeIngestErrorDetailsText(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (looksLikeHtmlDocument(t)) {
    return `${HTML_INGEST_HINT}\n\n(HTML response omitted.)`;
  }
  return truncateIngestErrorBody(t, 4000);
}
