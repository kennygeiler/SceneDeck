import OpenAI from "openai";

import type { ShotWithDetails } from "@/lib/types";
import {
  getDirectionDisplayName,
  getMovementDisplayName,
  getShotSizeDisplayName,
  getSpeedDisplayName,
} from "@/lib/shot-display";

export const SHOT_EMBEDDING_MODEL = "text-embedding-3-small";
export const SHOT_EMBEDDING_DIMENSIONS = 768;

function resolveApiKey(apiKey?: string) {
  const resolvedApiKey = apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (!resolvedApiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  return resolvedApiKey;
}

export function buildShotSearchText(shot: ShotWithDetails) {
  return [
    shot.film.title,
    shot.film.director,
    getMovementDisplayName(shot.metadata.movementType),
    getDirectionDisplayName(shot.metadata.direction),
    getSpeedDisplayName(shot.metadata.speed),
    getShotSizeDisplayName(shot.metadata.shotSize),
    shot.semantic?.description ?? "",
    shot.semantic?.mood ?? "",
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

export async function generateTextEmbedding(input: string, apiKey?: string) {
  const client = new OpenAI({
    apiKey: resolveApiKey(apiKey),
  });
  const response = await client.embeddings.create({
    model: SHOT_EMBEDDING_MODEL,
    input,
    dimensions: SHOT_EMBEDDING_DIMENSIONS,
  });
  const embedding = response.data[0]?.embedding;

  if (!embedding || embedding.length !== SHOT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Expected ${SHOT_EMBEDDING_DIMENSIONS}-dim embedding, received ${embedding?.length ?? 0}.`,
    );
  }

  return embedding;
}

export function toVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}
