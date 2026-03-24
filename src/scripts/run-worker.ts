/**
 * Batch pipeline worker — processes the job queue.
 * Run with: pnpm worker
 */

import { runWorkerLoop } from "@/lib/queue-workers";

const workerId = `worker-${process.pid}-${Date.now()}`;

console.log(`[worker] Starting batch pipeline worker: ${workerId}`);
console.log("[worker] Processing queues: detect → extract → classify → embed");
console.log("[worker] Press Ctrl+C to stop\n");

process.on("SIGINT", () => {
  console.log("\n[worker] Shutting down gracefully...");
  process.exit(0);
});

runWorkerLoop(workerId).catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
