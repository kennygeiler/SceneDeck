/**
 * Compare gold vs predicted boundary cuts (and optional slot accuracy).
 *
 *   pnpm eval:pipeline -- eval/gold/my-film.json eval/predicted/run-a.json --tol 0.5 --slots
 *
 * Gold / predicted JSON: either a raw number[] or { "cutsSec": number[], "shots": [...] }.
 */
import { readFileSync } from "node:fs";

import { evalBoundaryCuts } from "@/lib/boundary-eval";
import { evalTaxonomySlots, type GoldShotSegment } from "@/lib/slot-eval";

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
  throw new Error("Expected a number[] or an object with cutsSec: number[]");
}

function extractShots(data: unknown): GoldShotSegment[] | null {
  if (!data || typeof data !== "object") return null;
  const s = (data as { shots?: unknown }).shots;
  if (!Array.isArray(s)) return null;
  const out: GoldShotSegment[] = [];
  for (const row of s) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const startSec = Number(o.startSec);
    const endSec = Number(o.endSec);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    out.push({
      startSec,
      endSec,
      framing: o.framing != null ? String(o.framing) : null,
      shotSize: o.shotSize != null ? String(o.shotSize) : null,
    });
  }
  return out.length ? out : null;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  let tol = 0.5;
  let iou = 0.35;
  let gold = "";
  let pred = "";
  let slots = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tol") tol = Number(argv[++i]);
    else if (a === "--iou") iou = Number(argv[++i]);
    else if (a === "--slots") slots = true;
    else if (!gold) gold = a;
    else if (!pred) pred = a;
  }
  return { gold, pred, tol, iou, slots };
}

function main() {
  const { gold, pred, tol, iou, slots } = parseArgs();
  if (!gold || !pred) {
    console.error(
      "Usage: pnpm eval:pipeline -- <gold.json> <predicted.json> [--tol 0.5] [--iou 0.35] [--slots]",
    );
    process.exit(1);
  }

  const g = loadJson(gold);
  const p = loadJson(pred);
  const gCuts = extractCuts(g);
  const pCuts = extractCuts(p);
  const boundary = evalBoundaryCuts(gCuts, pCuts, tol);

  console.info(
    JSON.stringify(
      {
        boundary: {
          toleranceSec: boundary.toleranceSec,
          truePositives: boundary.truePositives,
          falsePositives: boundary.falsePositives,
          falseNegatives: boundary.falseNegatives,
          precision: boundary.precision,
          recall: boundary.recall,
          f1: boundary.f1,
          matchedPairsSample: boundary.matchedPairs.slice(0, 40),
        },
      },
      null,
      2,
    ),
  );

  if (slots) {
    const gShots = extractShots(g);
    const pShots = extractShots(p);
    if (gShots?.length && pShots?.length) {
      const taxonomySlots = evalTaxonomySlots(gShots, pShots, iou);
      console.info(JSON.stringify({ taxonomySlots }, null, 2));
    } else {
      console.warn(
        "Slot eval skipped: need shots[] with startSec/endSec in both files.",
      );
    }
  }
}

main();
