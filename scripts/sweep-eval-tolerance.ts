/**
 * Scan tolerance values for two static eval JSON files (local what-if).
 *
 *   pnpm eval:sweep-tol -- eval/gold/smoke.json eval/predicted/smoke.json
 */
import { readFileSync } from "node:fs";

import { evalBoundaryCuts } from "../src/lib/boundary-eval";

function loadJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function extractCuts(data: unknown): number[] {
  if (Array.isArray(data)) {
    return data.map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  }
  if (data && typeof data === "object" && "cutsSec" in data) {
    const c = (data as { cutsSec: unknown }).cutsSec;
    if (Array.isArray(c)) {
      return c.map(Number).filter((x) => Number.isFinite(x) && x >= 0);
    }
  }
  throw new Error("Expected number[] or { cutsSec: number[] }");
}

function main() {
  const [goldPath, predPath] = process.argv.slice(2);
  if (!goldPath || !predPath) {
    console.error(
      "Usage: pnpm eval:sweep-tol -- <gold.json> <predicted.json>",
    );
    process.exit(1);
  }

  const gCuts = extractCuts(loadJson(goldPath));
  const pCuts = extractCuts(loadJson(predPath));

  for (let tol = 0.05; tol <= 1.01; tol += 0.05) {
    const t = Math.round(tol * 100) / 100;
    const r = evalBoundaryCuts(gCuts, pCuts, t);
    console.info(
      JSON.stringify({
        tol: t,
        precision: r.precision,
        recall: r.recall,
        f1: r.f1,
        tp: r.truePositives,
        fp: r.falsePositives,
        fn: r.falseNegatives,
      }),
    );
  }
}

main();
