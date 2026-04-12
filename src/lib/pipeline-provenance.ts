import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

/**
 * Short SHA-256 of TS + Python taxonomy sources (AC-02 parity files).
 * On Vercel/serverless, repo source files are often absent — set `METROVISION_TAXONOMY_HASH`
 * (16 hex chars from `pnpm check:taxonomy` / local `computeTaxonomyHash`) so export manifest stays stable.
 */
export function computeTaxonomyHash(): string {
  const envHash = process.env.METROVISION_TAXONOMY_HASH?.trim();
  if (envHash && /^[a-f0-9]{16}$/i.test(envHash)) {
    return envHash.toLowerCase();
  }

  const root = repoRoot();
  const tsPath = path.join(root, "src/lib/taxonomy.ts");
  const pyPath = path.join(root, "pipeline/taxonomy.py");
  const h = createHash("sha256");
  try {
    if (existsSync(tsPath)) {
      h.update(readFileSync(tsPath, "utf8"));
    } else {
      h.update("# src/lib/taxonomy.ts not available on filesystem\n");
    }
    h.update("\n");
    if (existsSync(pyPath)) {
      h.update(readFileSync(pyPath, "utf8"));
    } else {
      h.update("# pipeline/taxonomy.py not available on filesystem\n");
    }
    return h.digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update("taxonomy-hash-unavailable").digest("hex").slice(0, 16);
  }
}

/** Coerce DB jsonb / string into a JSON-safe manifest payload. */
export function normalizeIngestProvenanceForManifest(
  raw: unknown,
): IngestProvenancePayload | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    if (raw.trim() === "") return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "object" && parsed !== null
        ? (parsed as IngestProvenancePayload)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as IngestProvenancePayload;
  }
  return null;
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
