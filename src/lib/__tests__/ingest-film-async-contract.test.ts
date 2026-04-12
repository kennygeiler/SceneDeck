import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ingest-film/async/route";
import { GET } from "@/app/api/ingest-film/jobs/[id]/route";

function minimalValidBody(): string {
  return JSON.stringify({
    videoPath: "/tmp/metrovision-async-contract-nonexistent.mp4",
    filmTitle: "Async Contract Film",
    director: "Vitest",
    year: 2020,
  });
}

describe("POST /api/ingest-film/async contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await POST(
      new Request("http://127.0.0.1/api/ingest-film/async", {
        method: "POST",
        body: "{not-json",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing required fields with 400", async () => {
    const res = await POST(
      new Request("http://127.0.0.1/api/ingest-film/async", {
        method: "POST",
        body: JSON.stringify({ filmTitle: "x" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 on Vercel when worker proxy is not configured", async () => {
    const saved = {
      VERCEL: process.env.VERCEL,
      INGEST: process.env.INGEST_WORKER_URL,
      NEXT_PUBLIC: process.env.NEXT_PUBLIC_WORKER_URL,
      DELEGATE: process.env.METROVISION_DELEGATE_INGEST,
    };
    try {
      process.env.VERCEL = "1";
      delete process.env.INGEST_WORKER_URL;
      delete process.env.NEXT_PUBLIC_WORKER_URL;
      delete process.env.METROVISION_DELEGATE_INGEST;

      const res = await POST(
        new Request("http://127.0.0.1/api/ingest-film/async", {
          method: "POST",
          body: minimalValidBody(),
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(res.status).toBe(503);
      const json = (await res.json()) as { error?: string };
      expect(json.error ?? "").toMatch(/INGEST_WORKER_URL|NEXT_PUBLIC_WORKER_URL/i);
    } finally {
      if (saved.VERCEL === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = saved.VERCEL;
      if (saved.INGEST === undefined) delete process.env.INGEST_WORKER_URL;
      else process.env.INGEST_WORKER_URL = saved.INGEST;
      if (saved.NEXT_PUBLIC === undefined) delete process.env.NEXT_PUBLIC_WORKER_URL;
      else process.env.NEXT_PUBLIC_WORKER_URL = saved.NEXT_PUBLIC;
      if (saved.DELEGATE === undefined) delete process.env.METROVISION_DELEGATE_INGEST;
      else process.env.METROVISION_DELEGATE_INGEST = saved.DELEGATE;
    }
  });

  it("forwards worker ingest gate header when proxying async POST", async () => {
    const saved = {
      INGEST: process.env.INGEST_WORKER_URL,
      SECRET: process.env.METROVISION_WORKER_INGEST_SECRET,
      VERCEL: process.env.VERCEL,
    };
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ jobId: "j", pollToken: "t" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      delete process.env.VERCEL;
      process.env.INGEST_WORKER_URL = "https://worker.async.contract.test";
      process.env.METROVISION_WORKER_INGEST_SECRET = "async-proxy-secret";

      await POST(
        new Request("http://127.0.0.1/api/ingest-film/async", {
          method: "POST",
          body: minimalValidBody(),
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init).toBeDefined();
      const headers = new Headers(init?.headers);
      expect(headers.get("x-metrovision-worker-ingest")).toBe("async-proxy-secret");
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/ingest-film/async");
    } finally {
      if (saved.INGEST === undefined) delete process.env.INGEST_WORKER_URL;
      else process.env.INGEST_WORKER_URL = saved.INGEST;
      if (saved.SECRET === undefined) delete process.env.METROVISION_WORKER_INGEST_SECRET;
      else process.env.METROVISION_WORKER_INGEST_SECRET = saved.SECRET;
      if (saved.VERCEL === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = saved.VERCEL;
    }
  });
});

describe("GET /api/ingest-film/jobs/[id] contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects missing poll token with 400", async () => {
    const res = await GET(new Request("http://127.0.0.1/api/ingest-film/jobs/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 503 on Vercel when worker proxy is not configured", async () => {
    const saved = {
      VERCEL: process.env.VERCEL,
      INGEST: process.env.INGEST_WORKER_URL,
      NEXT_PUBLIC: process.env.NEXT_PUBLIC_WORKER_URL,
      DELEGATE: process.env.METROVISION_DELEGATE_INGEST,
    };
    try {
      process.env.VERCEL = "1";
      delete process.env.INGEST_WORKER_URL;
      delete process.env.NEXT_PUBLIC_WORKER_URL;
      delete process.env.METROVISION_DELEGATE_INGEST;

      const res = await GET(
        new Request("http://127.0.0.1/api/ingest-film/jobs/abc?t=tok"),
        { params: Promise.resolve({ id: "abc" }) },
      );
      expect(res.status).toBe(503);
    } finally {
      if (saved.VERCEL === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = saved.VERCEL;
      if (saved.INGEST === undefined) delete process.env.INGEST_WORKER_URL;
      else process.env.INGEST_WORKER_URL = saved.INGEST;
      if (saved.NEXT_PUBLIC === undefined) delete process.env.NEXT_PUBLIC_WORKER_URL;
      else process.env.NEXT_PUBLIC_WORKER_URL = saved.NEXT_PUBLIC;
      if (saved.DELEGATE === undefined) delete process.env.METROVISION_DELEGATE_INGEST;
      else process.env.METROVISION_DELEGATE_INGEST = saved.DELEGATE;
    }
  });
});
