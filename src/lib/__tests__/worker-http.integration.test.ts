import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createMetrovisionWorkerApp } from "../../../worker/src/create-app.js";

describe("Express worker HTTP (integration)", () => {
  const secretKey = "METROVISION_WORKER_INGEST_SECRET";
  let prevSecret: string | undefined;
  let prevNodeEnv: string | undefined;

  afterEach(() => {
    if (prevSecret === undefined) delete process.env[secretKey];
    else process.env[secretKey] = prevSecret;
    prevSecret = undefined;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    prevNodeEnv = undefined;
  });

  it("GET / returns worker service payload", async () => {
    const app = createMetrovisionWorkerApp();
    const res = await request(app).get("/").expect(200);
    expect(res.body).toMatchObject({ service: "metrovision-worker", status: "ok" });
  });

  it("GET /health in development includes env booleans", async () => {
    prevNodeEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    const app = createMetrovisionWorkerApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.env).toBeDefined();
    expect(res.body.env).toHaveProperty("hasDb");
  });

  it("GET /health in production omits env fingerprint", async () => {
    prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const app = createMetrovisionWorkerApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).not.toHaveProperty("env");
    expect(res.body.service).toBe("metrovision-worker");
  });

  it("POST /api/ingest-film/stream returns 401 when ingest secret is set and header missing", async () => {
    prevSecret = process.env[secretKey];
    process.env[secretKey] = "test-worker-ingest-secret";
    const app = createMetrovisionWorkerApp();
    await request(app)
      .post("/api/ingest-film/stream")
      .send({})
      .set("Content-Type", "application/json")
      .expect(401);
  });

  it("POST /api/ingest-film/stream returns 400 when secret matches but body invalid", async () => {
    prevSecret = process.env[secretKey];
    process.env[secretKey] = "test-worker-ingest-secret";
    const app = createMetrovisionWorkerApp();
    const res = await request(app)
      .post("/api/ingest-film/stream")
      .set("x-metrovision-worker-ingest", "test-worker-ingest-secret")
      .set("Content-Type", "application/json")
      .send({})
      .expect(400);
    expect(String(res.body?.error ?? "")).toMatch(/videoPath|videoUrl|required/i);
  });

  it("POST /api/boundary-detect returns 401 when ingest secret is set and header missing", async () => {
    prevSecret = process.env[secretKey];
    process.env[secretKey] = "test-worker-ingest-secret";
    const app = createMetrovisionWorkerApp();
    await request(app)
      .post("/api/boundary-detect")
      .send({})
      .set("Content-Type", "application/json")
      .expect(401);
  });

  it("POST /api/boundary-detect returns 400 for missing videoPath when gate passes", async () => {
    prevSecret = process.env[secretKey];
    process.env[secretKey] = "test-worker-ingest-secret";
    const app = createMetrovisionWorkerApp();
    const res = await request(app)
      .post("/api/boundary-detect")
      .set("x-metrovision-worker-ingest", "test-worker-ingest-secret")
      .set("Content-Type", "application/json")
      .send({})
      .expect(400);
    expect(String(res.body?.error ?? "")).toMatch(/videoPath/i);
  });

  it("POST /api/ingest-film/async returns 401 when ingest secret is set and header missing", async () => {
    prevSecret = process.env[secretKey];
    process.env[secretKey] = "test-worker-ingest-secret";
    const app = createMetrovisionWorkerApp();
    await request(app)
      .post("/api/ingest-film/async")
      .send({})
      .set("Content-Type", "application/json")
      .expect(401);
  });

  it("POST /api/ingest-film/async returns 400 when secret matches but body invalid", async () => {
    prevSecret = process.env[secretKey];
    process.env[secretKey] = "test-worker-ingest-secret";
    const app = createMetrovisionWorkerApp();
    const res = await request(app)
      .post("/api/ingest-film/async")
      .set("x-metrovision-worker-ingest", "test-worker-ingest-secret")
      .set("Content-Type", "application/json")
      .send({})
      .expect(400);
    expect(String(res.body?.error ?? "")).toMatch(/videoPath|videoUrl|required/i);
  });
});
