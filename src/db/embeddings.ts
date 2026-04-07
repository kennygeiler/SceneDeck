import type { ShotWithDetails } from "@/lib/types";
import {
  generateTextEmbedding,
  SHOT_EMBEDDING_DIMENSIONS,
  SHOT_EMBEDDING_MODEL,
} from "@/lib/openai-embedding";
import {
  getDepthDisplayName,
  getFramingDisplayName,
  getShotSizeDisplayName,
  getBlockingDisplayName,
} from "@/lib/shot-display";

export { SHOT_EMBEDDING_MODEL, SHOT_EMBEDDING_DIMENSIONS, generateTextEmbedding };

export function buildShotSearchText(shot: ShotWithDetails) {
  return [
    shot.film.title,
    shot.film.director,
    getFramingDisplayName(shot.metadata.framing),
    getDepthDisplayName(shot.metadata.depth),
    getBlockingDisplayName(shot.metadata.blocking),
    getShotSizeDisplayName(shot.metadata.shotSize),
    shot.semantic?.description ?? "",
    shot.semantic?.mood ?? "",
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export function toVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
