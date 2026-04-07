import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Bump when ingest/classify/export contract changes materially. */
export const METROVISION_PIPELINE_VERSION = "2.1.0";

export type IngestProvenancePayload = {
  pipelineVersion: string;
  /** PySceneDetect threshold family, or `ensemble` when dual-detector NMS ran (Phase D). */
  detector: "content" | "adaptive" | "ensemble";
  geminiClassifyModel: string;
  geminiAdjudicateModel?: string | null;
  taxonomyHash: string;
  /** Resolved boundary strategy (env + merges), e.g. `pyscenedetect_ensemble_pyscene`. */
  boundaryDetector: string;
  ingestCompletedAt: string;
};

function repoRoot(): string {
  const cwd = process.cwd();
  if (cwd.endsWith(`${path.sep}worker`) || cwd.endsWith("/worker")) {
    return path.join(cwd, "..");
  }
  return cwd;
}

/** Short SHA-256 of TS + Python taxonomy sources (AC-02 parity files). */
export function computeTaxonomyHash(): string {
  const root = repoRoot();
  const ts = readFileSync(path.join(root, "src/lib/taxonomy.ts"), "utf8");
  const py = readFileSync(path.join(root, "pipeline/taxonomy.py"), "utf8");
  return createHash("sha256").update(ts).update("\n").update(py).digest("hex").slice(0, 16);
}

export function getGeminiClassifyModel(): string {
  const m = process.env.GEMINI_CLASSIFY_MODEL?.trim();
  return m && m.length > 0 ? m : "gemini-2.5-flash";
}

/** If set, one retry on JSON/parse failure with this model (Phase D dual-adjudication). */
export function getGeminiAdjudicateModel(): string | null {
  const m = process.env.GEMINI_ADJUDICATE_MODEL?.trim();
  return m && m.length > 0 ? m : null;
}

export function buildIngestProvenance(params: {
  detector: "content" | "adaptive" | "ensemble";
  boundaryDetector: string;
}): IngestProvenancePayload {
  return {
    pipelineVersion: METROVISION_PIPELINE_VERSION,
    detector: params.detector,
    geminiClassifyModel: getGeminiClassifyModel(),
    geminiAdjudicateModel: getGeminiAdjudicateModel(),
    taxonomyHash: computeTaxonomyHash(),
    boundaryDetector: params.boundaryDetector,
    ingestCompletedAt: new Date().toISOString(),
  };
}

const DEFAULT_LONG_SHOT_SEC = 90;

/** Per-shot triage after automated classification (Phase B). */
export function initialReviewStatusForShot(
  durationSec: number,
  usedFallback: boolean,
): "needs_review" | "unreviewed" {
  const raw = process.env.METROVISION_LONG_SHOT_REVIEW_SECONDS;
  const threshold =
    raw !== undefined && raw.trim() !== ""
      ? Number(raw)
      : DEFAULT_LONG_SHOT_SEC;
  const t = Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULT_LONG_SHOT_SEC;
  if (usedFallback) return "needs_review";
  if (durationSec >= t) return "needs_review";
  return "unreviewed";
}

export const EXPORT_MANIFEST_SCHEMA_VERSION = "1.0";

export type ExportManifest = {
  schemaVersion: typeof EXPORT_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  pipelineVersion: string;
  taxonomyHash: string;
  disclaimer: string;
  filters: Record<string, string | undefined>;
  shotCount: number;
  geminiClassifyModel: string;
  films: Array<{
    filmId: string;
    title: string;
    director: string;
    year: number | null;
    ingestProvenance: IngestProvenancePayload | null;
  }>;
};
