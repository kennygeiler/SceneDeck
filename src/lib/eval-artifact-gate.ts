/**
 * Operator gate for creating / listing eval artifacts (gold & predicted JSON).
 * - Development: if METROVISION_EVAL_ARTIFACT_ADMIN_SECRET is unset, POST/GET list are allowed (local only).
 * - Production: secret must be set; client must send Authorization: Bearer <secret>.
 *
 * Per-artifact retrieval uses ?t= only (see /api/eval/artifacts/[id]); no admin header needed.
 */

import { timingSafeEqual } from "node:crypto";

const ENV = "METROVISION_EVAL_ARTIFACT_ADMIN_SECRET";

export function getEvalArtifactAdminSecret(): string | undefined {
  const s = process.env[ENV]?.trim();
  return s || undefined;
}

function readBearer(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

function bearerMatchesSecret(request: Request, secret: string): boolean {
  const presented = readBearer(request) ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * For POST /api/eval/artifacts and GET list. Production requires configured secret + bearer.
 */
export function rejectUnlessEvalArtifactAdmin(request: Request): Response | null {
  const secret = getEvalArtifactAdminSecret();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        {
          error: `${ENV} must be set in production for create/list operations.`,
        },
        { status: 503 },
      );
    }
    return null;
  }

  if (!bearerMatchesSecret(request, secret)) {
    return Response.json(
      {
        error: `Unauthorized. Send Authorization: Bearer <${ENV}>.`,
      },
      { status: 401 },
    );
  }

  return null;
}
