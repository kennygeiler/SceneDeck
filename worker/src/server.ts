import { createMetrovisionWorkerApp } from "./create-app.js";
import { startIngestAsyncJobSweep } from "./ingest.js";

const app = createMetrovisionWorkerApp();
startIngestAsyncJobSweep();
const PORT = parseInt(process.env.PORT ?? "3100", 10);

app.listen(PORT, () => {
  console.log(`[worker] MetroVision worker listening on port ${PORT}`);
  console.log(`[worker] Health: http://localhost:${PORT}/health`);
});
