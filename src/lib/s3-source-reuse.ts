/**
 * Normalize ingest "reuse S3" textarea / API input into a raw object key.
 * Handles: JSON `{"s3Key":"..."}`, wrapped quotes, and https S3 URLs (virtual-hosted or path-style).
 */
export function normalizeS3SourceReuseInput(raw: string): string {
  let s = raw.trim();
  if (!s) return "";

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s) as { s3Key?: string; key?: string };
      const k = j.s3Key ?? j.key;
      if (typeof k === "string" && k.trim()) return k.trim();
    } catch {
      /* fall through */
    }
  }

  if (!/^https?:\/\//i.test(s)) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  try {
    const u = new URL(s);
    let path = u.pathname.replace(/^\//, "");
    const host = u.hostname.toLowerCase();

    const isPathStyle =
      host === "s3.amazonaws.com" ||
      /^s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(host);

    if (isPathStyle) {
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 2 && segments[0] !== "films") {
        path = segments.slice(1).join("/");
      }
    }

    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  } catch {
    return raw.trim();
  }
}
