import Replicate from "replicate";

/** Matches default Replicate CLIP ViT-L/14 output size (see model schema). */
export const SHOT_IMAGE_EMBEDDING_DIMS = 768;

/** Full Replicate model ref including version hash when required. */
export const DEFAULT_REPLICATE_CLIP_MODEL =
  process.env.REPLICATE_CLIP_EMBEDDING_MODEL?.trim() ||
  "andreasjansson/clip-features:75b33f253f7714a281ad3e9b28f63e3232d583716ef6718f2e46641077ea040a";

let client: Replicate | null = null;

function getReplicate() {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not set.");
  }
  client ??= new Replicate({ auth: token, useFileOutput: false });
  return client;
}

function flattenNumbers(value: unknown, depth = 0): number[] {
  if (depth > 6) return [];
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "number") {
      return value.filter((x) => typeof x === "number" && Number.isFinite(x)) as number[];
    }
    const out: number[] = [];
    for (const v of value) {
      out.push(...flattenNumbers(v, depth + 1));
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out: number[] = [];
    for (const v of Object.values(value as Record<string, unknown>)) {
      out.push(...flattenNumbers(v, depth + 1));
    }
    return out;
  }
  return [];
}

function extractPrimaryEmbedding(out: unknown): number[] {
  if (Array.isArray(out) && out[0] && typeof out[0] === "object" && out[0] !== null) {
    const row = out[0] as Record<string, unknown>;
    if (
      Array.isArray(row.embedding) &&
      row.embedding.every((x) => typeof x === "number")
    ) {
      return row.embedding as number[];
    }
  }
  return flattenNumbers(out);
}

function normalizeClipVector(raw: number[]): number[] {
  if (raw.length === SHOT_IMAGE_EMBEDDING_DIMS) return raw;
  if (raw.length > SHOT_IMAGE_EMBEDDING_DIMS) {
    return raw.slice(0, SHOT_IMAGE_EMBEDDING_DIMS);
  }
  if (raw.length === 0) {
    throw new Error("CLIP embedding was empty.");
  }
  throw new Error(
    `CLIP embedding dim ${raw.length} ≠ expected ${SHOT_IMAGE_EMBEDDING_DIMS}. Set REPLICATE_CLIP_EMBEDDING_MODEL and matching vector size in schema.`,
  );
}

/** Thumbnail URL must be publicly fetchable by Replicate (HTTPS in production). */
export async function generateImageEmbeddingFromUrl(imageUrl: string) {
  const replicate = getReplicate();
  const modelRef = DEFAULT_REPLICATE_CLIP_MODEL as `${string}/${string}:${string}`;
  const out = await replicate.run(modelRef, {
    input: {
      inputs: imageUrl,
    },
  });

  const vec = normalizeClipVector(extractPrimaryEmbedding(out));
  return { embedding: vec, model: DEFAULT_REPLICATE_CLIP_MODEL };
}
