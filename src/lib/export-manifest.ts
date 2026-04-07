import {
  EXPORT_MANIFEST_SCHEMA_VERSION,
  METROVISION_PIPELINE_VERSION,
  computeTaxonomyHash,
  getGeminiClassifyModel,
  type ExportManifest,
  type IngestProvenancePayload,
} from "./pipeline-provenance";

export const EXPORT_DATA_DISCLAIMER =
  "Rows are one detected shot each. autoGroupedScene* fields come from model grouping for navigation only—not screenplay or director-intent scenes. See .planning/research/pipeline-whitepaper.md.";

export function buildExportManifest(opts: {
  filters: Record<string, string | undefined>;
  shotCount: number;
  films: Array<{
    filmId: string;
    title: string;
    director: string;
    year: number | null;
    ingestProvenance: IngestProvenancePayload | null;
  }>;
}): ExportManifest {
  return {
    schemaVersion: EXPORT_MANIFEST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    pipelineVersion: METROVISION_PIPELINE_VERSION,
    taxonomyHash: computeTaxonomyHash(),
    disclaimer: EXPORT_DATA_DISCLAIMER,
    filters: opts.filters,
    shotCount: opts.shotCount,
    geminiClassifyModel: getGeminiClassifyModel(),
    films: opts.films,
  };
}
