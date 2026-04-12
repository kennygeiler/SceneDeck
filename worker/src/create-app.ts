import express from "express";
import cors from "cors";
import { boundaryDetectHandler } from "./boundary-detect.js";
import {
  ingestFilmHandler,
  ingestFilmAsyncPostHandler,
  ingestFilmJobGetHandler,
} from "./ingest.js";

const defaultOrigins = [
  "http://localhost:3000",
  "https://scene-deck.vercel.app",
  "https://metrovision.vercel.app",
];

/**
 * Express app for MetroVision worker (ingest SSE, boundary-detect).
 * Used by `server.ts` for listen and by HTTP integration tests (supertest) without binding a port.
 */
export function createMetrovisionWorkerApp(): express.Express {
  const app = express();

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        const explicit = process.env.ALLOWED_ORIGINS?.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const allowList = explicit?.length ? explicit : defaultOrigins;
        if (!origin) return callback(null, true);
        if (allowList.includes(origin)) return callback(null, true);
        if (process.env.ALLOW_VERCEL_SUBDOMAINS === "1" && /\.vercel\.app$/i.test(origin))
          return callback(null, true);
        console.warn("[worker] CORS rejected origin:", origin);
        return callback(null, false);
      },
    }),
  );

  app.use(express.json({ limit: "10mb" }));

  app.get("/", (_req, res) => {
    res.json({ service: "metrovision-worker", status: "ok" });
  });

  app.get("/health", (_req, res) => {
    const base = {
      status: "ok",
      service: "metrovision-worker",
      uptime: process.uptime(),
    };
    if (process.env.NODE_ENV === "production") {
      res.json(base);
      return;
    }
    res.json({
      ...base,
      env: {
        hasGoogleKey: !!process.env.GOOGLE_API_KEY,
        hasAws: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_S3_BUCKET,
        hasDb: !!process.env.DATABASE_URL,
        hasScenedetectPath: !!process.env.SCENEDETECT_PATH,
      },
    });
  });

  app.post("/api/ingest-film/stream", ingestFilmHandler);
  app.post("/api/ingest-film/async", ingestFilmAsyncPostHandler);
  app.get("/api/ingest-film/jobs/:id", ingestFilmJobGetHandler);
  app.post("/api/boundary-detect", boundaryDetectHandler);

  return app;
}
