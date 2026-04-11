import express from "express";
import cors from "cors";
import { boundaryDetectHandler } from "./boundary-detect.js";
import { ingestFilmHandler } from "./ingest.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3100", 10);

const defaultOrigins = [
  "http://localhost:3000",
  "https://scene-deck.vercel.app",
  "https://metrovision.vercel.app",
];

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

// Root — prevents 404 noise in browser console
app.get("/", (_req, res) => {
  res.json({ service: "metrovision-worker", status: "ok" });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "metrovision-worker",
    uptime: process.uptime(),
    env: {
      hasGoogleKey: !!process.env.GOOGLE_API_KEY,
      hasAws: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_S3_BUCKET,
      hasDb: !!process.env.DATABASE_URL,
      hasScenedetectPath: !!process.env.SCENEDETECT_PATH,
    },
  });
});

// SSE streaming ingestion endpoint
app.post("/api/ingest-film/stream", ingestFilmHandler);

// Phase 10: detect-only with DB boundary preset (JSON response)
app.post("/api/boundary-detect", boundaryDetectHandler);

app.listen(PORT, () => {
  console.log(`[worker] MetroVision worker listening on port ${PORT}`);
  console.log(`[worker] Health: http://localhost:${PORT}/health`);
});
