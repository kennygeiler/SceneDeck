/**
 * CI-friendly boundary eval on tiny in-repo gold vs predicted files.
 *
 *   pnpm eval:smoke
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { evalBoundaryCuts } from "../src/lib/boundary-eval";

const ROOT = path.dirname(__dirname);

function loadCuts(relPath: string): number[] {
  const raw = JSON.parse(readFileSync(path.join(ROOT, relPath), "utf8")) as unknown;
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  }
  if (raw && typeof raw === "object" && "cutsSec" in raw) {
    const c = (raw as { cutsSec: unknown }).cutsSec;
    if (Array.isArray(c)) {
      return c.map(Number).filter((x) => Number.isFinite(x) && x >= 0);
    }
  }
  throw new Error(`Invalid eval JSON: ${relPath}`);
}

const tol = 0.5;
const gold = loadCuts("eval/gold/smoke.json");
const pred = loadCuts("eval/predicted/smoke.json");
const r = evalBoundaryCuts(gold, pred, tol);

if (r.falseNegatives > 0 || r.falsePositives > 0 || r.f1 < 1) {
  console.error("[eval:smoke] FAILED", r);
  process.exit(1);
}

console.info("[eval:smoke] OK", {
  toleranceSec: r.toleranceSec,
  f1: r.f1,
  truePositives: r.truePositives,
});
