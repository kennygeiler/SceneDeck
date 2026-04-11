/**
 * Gold-vs-predicted **hard cut** times (seconds). One-to-one matching within tolerance.
 * Cuts are transition instants (not shot starts if you include 0 — exclude 0 and duration for metrics on interior cuts only).
 */

export type BoundaryEvalResult = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  toleranceSec: number;
  matchedPairs: Array<{ gt: number; pred: number; deltaSec: number }>;
  /** Gold cut times (normalized) with no predicted match within tolerance. */
  unmatchedGoldSec: number[];
  /** Predicted cut times (normalized) with no gold match within tolerance. */
  unmatchedPredSec: number[];
};

/** Sort, dedupe (merge within tiny epsilon), drop non-finite. */
export function normalizeCutList(cuts: number[], dedupeEps = 0.05): number[] {
  const s = [...new Set(cuts.filter((t) => Number.isFinite(t) && t >= 0))]
    .sort((a, b) => a - b);
  if (s.length === 0) return [];
  const out: number[] = [s[0]!];
  for (let i = 1; i < s.length; i++) {
    if (s[i]! - out[out.length - 1]! > dedupeEps) {
      out.push(s[i]!);
    }
  }
  return out;
}

/**
 * One-to-one greedy matching: each GT pairs with at most one pred within `toleranceSec`.
 * Unmatched predictions count as FP; unmatched GT as FN.
 */
export function evalBoundaryCuts(
  goldCuts: number[],
  predCuts: number[],
  toleranceSec: number,
): BoundaryEvalResult {
  const tol = Math.max(0, toleranceSec);
  const gt = normalizeCutList(goldCuts);
  const pred = normalizeCutList(predCuts);

  if (gt.length === 0 && pred.length === 0) {
    return {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1,
      recall: 1,
      f1: 1,
      toleranceSec: tol,
      matchedPairs: [],
      unmatchedGoldSec: [],
      unmatchedPredSec: [],
    };
  }

  if (gt.length === 0) {
    return {
      truePositives: 0,
      falsePositives: pred.length,
      falseNegatives: 0,
      precision: 0,
      recall: 1,
      f1: 0,
      toleranceSec: tol,
      matchedPairs: [],
      unmatchedGoldSec: [],
      unmatchedPredSec: [...pred],
    };
  }

  if (pred.length === 0) {
    return {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: gt.length,
      precision: 1,
      recall: 0,
      f1: 0,
      toleranceSec: tol,
      matchedPairs: [],
      unmatchedGoldSec: [...gt],
      unmatchedPredSec: [],
    };
  }

  type Pair = { g: number; p: number; d: number };
  const pairs: Pair[] = [];
  for (const g of gt) {
    for (const p of pred) {
      const d = Math.abs(p - g);
      if (d <= tol) {
        pairs.push({ g, p, d });
      }
    }
  }
  pairs.sort((a, b) => a.d - b.d);

  const usedG = new Set<number>();
  const usedP = new Set<number>();
  const matchedPairs: BoundaryEvalResult["matchedPairs"] = [];

  for (const { g, p, d } of pairs) {
    if (usedG.has(g) || usedP.has(p)) continue;
    usedG.add(g);
    usedP.add(p);
    matchedPairs.push({ gt: g, pred: p, deltaSec: d });
  }

  const tp = matchedPairs.length;
  const fn = gt.length - tp;
  const fp = pred.length - tp;
  const prec = tp / pred.length;
  const rec = tp / gt.length;
  const f1 = prec + rec > 0 ? (2 * prec * rec) / (prec + rec) : 0;

  const unmatchedGoldSec = gt.filter((g) => !usedG.has(g));
  const unmatchedPredSec = pred.filter((p) => !usedP.has(p));

  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision: prec,
    recall: rec,
    f1,
    toleranceSec: tol,
    matchedPairs,
    unmatchedGoldSec,
    unmatchedPredSec,
  };
}

/** Interior hard-cut instants between consecutive shots (excludes 0 and `durationSec`). */
export function interiorCutSecFromSplits(
  splits: Array<{ start: number; end: number }>,
  durationSec: number,
): number[] {
  const d =
    Number.isFinite(durationSec) && durationSec > 0
      ? durationSec
      : Math.max(0, ...splits.map((s) => s.end), 0);
  const set = new Set<number>();
  for (let i = 0; i < splits.length - 1; i++) {
    const t = Math.round(splits[i]!.end * 1000) / 1000;
    if (t > 0 && t < d) set.add(t);
  }
  return [...set].sort((a, b) => a - b);
}
