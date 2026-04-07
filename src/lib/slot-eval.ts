/**
 * Interval IoU + greedy matching for **taxonomy slot** accuracy (e.g. framing) on time-aligned shots.
 * Gold and predicted segments must use the same timebase (seconds).
 */

export type GoldShotSegment = {
  startSec: number;
  endSec: number;
  /** Taxonomy slugs or display strings; compared after normalize */
  framing?: string | null;
  shotSize?: string | null;
};

function normalizeSlug(v: string | null | undefined): string | null {
  if (v == null || String(v).trim() === "") return null;
  return String(v).trim().toLowerCase();
}

export function intervalIou(
  a: { start: number; end: number },
  b: { start: number; end: number },
): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  const inter = Math.max(0, end - start);
  const union = Math.max(a.end - a.start, 0) + Math.max(b.end - b.start, 0) - inter;
  return union <= 0 ? 0 : inter / union;
}

export type SlotEvalSummary = {
  matchedPairs: number;
  framingCorrect: number;
  shotSizeCorrect: number;
  framingDenominator: number;
  shotSizeDenominator: number;
  framingAccuracy: number | null;
  shotSizeAccuracy: number | null;
};

/**
 * Greedy: sort by descending IoU, assign each pred to at most one gold.
 * Accuracy = correct / matched pairs where gold had that field set.
 */
export function evalTaxonomySlots(
  gold: GoldShotSegment[],
  pred: GoldShotSegment[],
  iouMin = 0.35,
): SlotEvalSummary {
  type Pair = {
    gi: number;
    pi: number;
    iou: number;
  };
  const pairs: Pair[] = [];
  for (let gi = 0; gi < gold.length; gi++) {
    const g = gold[gi]!;
    for (let pi = 0; pi < pred.length; pi++) {
      const p = pred[pi]!;
      const iou = intervalIou(
        { start: g.startSec, end: g.endSec },
        { start: p.startSec, end: p.endSec },
      );
      if (iou >= iouMin) {
        pairs.push({ gi, pi, iou });
      }
    }
  }
  pairs.sort((a, b) => b.iou - a.iou);
  const usedG = new Set<number>();
  const usedP = new Set<number>();
  const matches: Array<{ g: GoldShotSegment; p: GoldShotSegment }> = [];
  for (const { gi, pi } of pairs) {
    if (usedG.has(gi) || usedP.has(pi)) continue;
    usedG.add(gi);
    usedP.add(pi);
    matches.push({ g: gold[gi]!, p: pred[pi]! });
  }

  let framingCorrect = 0;
  let shotSizeCorrect = 0;
  let framingDenom = 0;
  let shotSizeDenom = 0;

  for (const { g, p } of matches) {
    const gF = normalizeSlug(g.framing);
    const pF = normalizeSlug(p.framing);
    if (gF != null) {
      framingDenom++;
      if (pF != null && gF === pF) framingCorrect++;
    }
    const gS = normalizeSlug(g.shotSize);
    const pS = normalizeSlug(p.shotSize);
    if (gS != null) {
      shotSizeDenom++;
      if (pS != null && gS === pS) shotSizeCorrect++;
    }
  }

  return {
    matchedPairs: matches.length,
    framingCorrect,
    shotSizeCorrect,
    framingDenominator: framingDenom,
    shotSizeDenominator: shotSizeDenom,
    framingAccuracy:
      framingDenom > 0 ? framingCorrect / framingDenom : null,
    shotSizeAccuracy:
      shotSizeDenom > 0 ? shotSizeCorrect / shotSizeDenom : null,
  };
}
