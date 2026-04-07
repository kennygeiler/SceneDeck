/**
 * API key authentication for the v1 REST API.
 * AC-21: No auth in v1 — API keys only, operator-issued, no OAuth.
 */

import { createHash, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db, schema } from "@/db";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(
  request: NextRequest,
): Promise<{ valid: true; keyId: string } | { valid: false; error: string }> {
  const authHeader = request.headers.get("authorization");
  const queryKey = request.nextUrl.searchParams.get("api_key");

  const rawKey = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : queryKey?.trim();

  if (!rawKey) {
    return {
      valid: false,
      error: "Missing API key. Provide via Authorization: Bearer <key> header or ?api_key= query parameter.",
    };
  }

  const keyHash = hashKey(rawKey);

  const [row] = await db
    .select({ id: schema.apiKeys.id, revoked: schema.apiKeys.revoked })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) {
    return { valid: false, error: "Invalid API key." };
  }

  if (row.revoked) {
    return { valid: false, error: "API key has been revoked." };
  }

  // Update last_used_at (fire-and-forget)
  db.update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id))
    .catch(() => {});

  return { valid: true, keyId: row.id };
}

/**
 * Generate a new API key. Returns the raw key (show once to operator)
 * and stores the hash.
 */
export async function generateApiKey(name: string): Promise<{ key: string; id: string }> {
  const raw = `mv_${randomUUID().replace(/-/g, "")}`;
  const keyHash = hashKey(raw);

  const [row] = await db
    .insert(schema.apiKeys)
    .values({ name, keyHash })
    .returning({ id: schema.apiKeys.id });

  return { key: raw, id: row.id };
}
