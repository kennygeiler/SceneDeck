import type { VizShot } from "@/lib/types";

/** Row shape after `getVisualizationData` SQL select (nullable join columns). */
export type RawVisualizationRow = {
  shotId: string;
  filmId: string;
  filmTitle: string;
  director: string;
  sceneTitle: string | null | undefined;
  sceneNumber: number | null | undefined;
  framing: string | null | undefined;
  depth: string | null | undefined;
  blocking: string | null | undefined;
  shotSize: string | null | undefined;
  angleVertical: string | null | undefined;
  angleHorizontal: string | null | undefined;
  symmetry: string | null | undefined;
  dominantLines: string | null | undefined;
  lightingDirection: string | null | undefined;
  lightingQuality: string | null | undefined;
  colorTemperature: string | null | undefined;
  durationCat: string | null | undefined;
  foregroundElements: string[] | null | undefined;
  backgroundElements: string[] | null | undefined;
  confidence: number | null | undefined;
  reviewStatus: string | null | undefined;
  duration: number | null | undefined;
  description: string | null | undefined;
};

export function mapRawVisualizationRowToVizShot(
  row: RawVisualizationRow,
  shotIndex: number,
  objectCount: number,
): VizShot {
  const fg = row.foregroundElements ?? [];
  const bg = row.backgroundElements ?? [];
  return {
    id: row.shotId,
    filmId: row.filmId,
    filmTitle: row.filmTitle,
    director: row.director,
    sceneTitle: row.sceneTitle ?? null,
    sceneNumber: row.sceneNumber ?? null,
    shotIndex,
    framing: row.framing ?? "centered",
    depth: row.depth ?? "medium",
    blocking: row.blocking ?? "single",
    shotSize: row.shotSize ?? "medium",
    angleVertical: row.angleVertical ?? "eye_level",
    angleHorizontal: row.angleHorizontal ?? "frontal",
    symmetry: row.symmetry ?? "asymmetric",
    dominantLines: row.dominantLines ?? "none",
    lightingDirection: row.lightingDirection ?? "natural",
    lightingQuality: row.lightingQuality ?? "soft",
    colorTemperature: row.colorTemperature ?? "neutral",
    durationCategory: row.durationCat ?? "standard",
    foregroundCount: fg.length,
    backgroundCount: bg.length,
    duration: row.duration ?? 0,
    objectCount,
    description: row.description ?? null,
    confidence: row.confidence ?? null,
    reviewStatus: row.reviewStatus ?? null,
  };
}
