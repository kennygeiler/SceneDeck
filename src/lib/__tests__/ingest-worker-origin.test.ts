import { describe, expect, it } from "vitest";

import { normalizeWorkerOrigin } from "../ingest-worker-delegate";

describe("normalizeWorkerOrigin", () => {
  it("returns origin when given full ingest path (prevents double /api/ingest-film/stream)", () => {
    expect(
      normalizeWorkerOrigin("https://metrovision.vercel.app/api/ingest-film/stream"),
    ).toBe("https://metrovision.vercel.app");
  });

  it("strips trailing slash and path on worker URL", () => {
    expect(normalizeWorkerOrigin("https://worker.example.com/foo/bar/")).toBe(
      "https://worker.example.com",
    );
  });

  it("still trims trailing /api on bare string without URL parse", () => {
    expect(normalizeWorkerOrigin("http://localhost:3100/api")).toBe("http://localhost:3100");
  });
});
