import { describe, expect, it } from "vitest";

import {
  looksLikeHtmlDocument,
  sanitizeIngestErrorDetailsText,
  sanitizeIngestHttpErrorBody,
} from "../ingest-error-sanitize";

describe("looksLikeHtmlDocument", () => {
  it("detects doctype and html", () => {
    expect(looksLikeHtmlDocument("<!DOCTYPE html><html>")).toBe(true);
    expect(looksLikeHtmlDocument("  <html lang=en>")).toBe(true);
  });

  it("returns false for JSON and plain text", () => {
    expect(looksLikeHtmlDocument('{"error":"nope"}')).toBe(false);
    expect(looksLikeHtmlDocument("Connection refused")).toBe(false);
  });
});

describe("sanitizeIngestHttpErrorBody", () => {
  it("replaces HTML with a short hint", () => {
    const out = sanitizeIngestHttpErrorBody(404, "<!DOCTYPE html><html><body>no</body></html>");
    expect(out).toContain("HTTP 404");
    expect(out).toContain("HTML page");
    expect(out.length).toBeLessThan(900);
  });

  it("truncates long non-HTML bodies", () => {
    const long = "x".repeat(5000);
    const out = sanitizeIngestHttpErrorBody(500, long);
    expect(out.length).toBeLessThan(1300);
    expect(out).toContain("characters total");
  });
});

describe("sanitizeIngestErrorDetailsText", () => {
  it("omits HTML in details panel", () => {
    const out = sanitizeIngestErrorDetailsText("<!DOCTYPE html><title>x</title>");
    expect(out).toContain("omitted");
    expect(out).not.toContain("<!DOCTYPE");
  });
});
