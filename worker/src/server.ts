import express from "express";
import cors from "cors";
import { ingestFilmHandler } from "./ingest.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3100", 10);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") ?? ["http://localhost:3000", "https://scene-deck.vercel.app"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

// Root — prevents 404 noise in browser console
app.get("/", (_req, res) => {
  res.json({ service: "scenedeck-worker", status: "ok" });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "scenedeck-worker",
    uptime: process.uptime(),
    env: {
      hasGoogleKey: !!process.env.GOOGLE_API_KEY,
      hasAws: !!process.env.AWS_ACCESS_KEY_ID,
      hasDb: !!process.env.DATABASE_URL,
      hasScenedetect: !!process.env.SCENEDETECT_PATH || true,
    },
  });
});

// SSE streaming ingestion endpoint
app.post("/api/ingest-film/stream", ingestFilmHandler);

app.listen(PORT, () => {
  console.log(`[worker] SceneDeck worker listening on port ${PORT}`);
  console.log(`[worker] Health: http://localhost:${PORT}/health`);
});
