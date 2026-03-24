import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const BUCKET = process.env.AWS_S3_BUCKET ?? "";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return _client;
}

export function getBucket(): string {
  if (!BUCKET) throw new Error("AWS_S3_BUCKET is not set.");
  return BUCKET;
}

/**
 * Upload a buffer to S3.
 * Returns the S3 key.
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/**
 * Generate a presigned URL for reading an S3 object.
 * Default expiry: 1 hour.
 */
export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
    { expiresIn },
  );
}

/**
 * Get an S3 object as a readable stream with metadata.
 */
export async function getS3Object(key: string) {
  const client = getClient();
  return client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
}

/**
 * Generate a presigned PUT URL for direct browser → S3 upload.
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getClient();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

/**
 * Build an S3 key for a film asset.
 * Pattern: films/{slug}/{type}/{filename}
 */
export function buildS3Key(
  filmSlug: string,
  type: "source" | "clips" | "thumbnails",
  filename: string,
): string {
  return `films/${filmSlug}/${type}/${filename}`;
}
