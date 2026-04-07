import OpenAI from "openai";

export const SHOT_EMBEDDING_MODEL = "text-embedding-3-small";
export const SHOT_EMBEDDING_DIMENSIONS = 768;

function resolveApiKey(apiKey?: string) {
  const resolvedApiKey = apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!resolvedApiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  return resolvedApiKey;
}

/** Text → 768-dim vector (shared by Next app ingest and Express worker). */
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
