/**
 * List false-negative gold cuts and false-positive predictions (same greedy matching as eval:pipeline).
 *
 *   pnpm eval:boundary-misses -- eval/gold/foo.json eval/predicted/foo.json [--tol 0.5] [--json]
 */
import { readFileSync } from "node:fs";

import { evalBoundaryCuts } from "@/lib/boundary-eval";

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

function parseArgs(argv: string[]) {
  let tol = 0.5;
  let jsonOut = false;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--tol" && argv[i + 1]) {
      tol = Number(argv[++i]);
      if (!Number.isFinite(tol) || tol < 0) throw new Error("--tol must be a non-negative number");
    } else if (a === "--json") {
      jsonOut = true;
    } else if (!a.startsWith("-")) {
      files.push(a);
    }
  }
  if (files.length < 2) {
    console.error(
      "Usage: eval:boundary-misses -- <gold.json> <predicted.json> [--tol SEC] [--json]",
    );
    process.exit(1);
  }
  return { goldPath: files[0]!, predPath: files[1]!, tol, jsonOut };
}

function main() {
  const { goldPath, predPath, tol, jsonOut } = parseArgs(process.argv.slice(2));
  const goldCuts = extractCuts(loadJson(goldPath));
  const predCuts = extractCuts(loadJson(predPath));
  const ev = evalBoundaryCuts(goldCuts, predCuts, tol);

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          goldPath,
          predPath,
          toleranceSec: ev.toleranceSec,
          precision: ev.precision,
          recall: ev.recall,
          f1: ev.f1,
          truePositives: ev.truePositives,
          falsePositives: ev.falsePositives,
          falseNegatives: ev.falseNegatives,
          unmatchedGoldSec: ev.unmatchedGoldSec,
          unmatchedPredSec: ev.unmatchedPredSec,
          matchedPairs: ev.matchedPairs,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Gold: ${goldPath}`);
  console.log(`Pred: ${predPath}`);
  console.log(`Tolerance: ${ev.toleranceSec}s`);
  console.log(
    `P=${ev.precision.toFixed(4)} R=${ev.recall.toFixed(4)} F1=${ev.f1.toFixed(4)} TP=${ev.truePositives} FP=${ev.falsePositives} FN=${ev.falseNegatives}`,
  );
  console.log("");
  console.log(`False negatives (gold, no pred within tol): ${ev.unmatchedGoldSec.length}`);
  for (const t of ev.unmatchedGoldSec) {
    console.log(`  ${t}`);
  }
  console.log("");
  console.log(`False positives (pred, no gold within tol): ${ev.unmatchedPredSec.length}`);
  for (const t of ev.unmatchedPredSec) {
    console.log(`  ${t}`);
  }
}

main();
