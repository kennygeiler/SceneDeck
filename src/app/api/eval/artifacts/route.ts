export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash, randomBytes } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { getEvalArtifactAdminSecret, rejectUnlessEvalArtifactAdmin } from "@/lib/eval-artifact-gate";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function newRetrievalToken(): string {
  return `ea_${randomBytes(24).toString("base64url")}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** List recent artifacts (metadata only). Requires admin bearer when secret is set. */
export async function GET(request: Request) {
  const reject = rejectUnlessEvalArtifactAdmin(request);
  if (reject) return reject;

  const rows = await db
    .select({
      id: schema.evalArtifacts.id,
      kind: schema.evalArtifacts.kind,
      filmId: schema.evalArtifacts.filmId,
      label: schema.evalArtifacts.label,
      createdAt: schema.evalArtifacts.createdAt,
    })
    .from(schema.evalArtifacts)
    .orderBy(desc(schema.evalArtifacts.createdAt))
    .limit(200);

  return NextResponse.json({ artifacts: rows });
}

/** Create artifact; returns retrieval token once. Optional admin bearer when secret is set. */
export async function POST(request: Request) {
  const reject = rejectUnlessEvalArtifactAdmin(request);
  if (reject) return reject;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== "gold" && kind !== "predicted") {
    return NextResponse.json(
      { error: 'kind must be "gold" or "predicted".' },
      { status: 400 },
    );
  }

  const payload = o.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "payload must be a JSON object." }, { status: 400 });
  }

  let filmId: string | null = null;
  if (o.filmId != null) {
    if (typeof o.filmId !== "string" || !isUuid(o.filmId)) {
      return NextResponse.json({ error: "filmId must be a UUID or null." }, { status: 400 });
    }
    const [filmRow] = await db
      .select({ id: schema.films.id })
      .from(schema.films)
      .where(eq(schema.films.id, o.filmId))
      .limit(1);
    if (!filmRow) {
      return NextResponse.json({ error: "filmId not found." }, { status: 400 });
    }
    filmId = o.filmId;
  }

  const sessionId = o.sessionId != null ? String(o.sessionId).slice(0, 128) : null;
  const label = o.label != null ? String(o.label).slice(0, 256) : null;

  const rawToken = newRetrievalToken();
  const tokenHash = hashToken(rawToken);

  const [row] = await db
    .insert(schema.evalArtifacts)
    .values({
      kind,
      filmId,
      sessionId: sessionId || null,
      label,
      payload,
      tokenHash,
    })
    .returning({ id: schema.evalArtifacts.id });

  if (!row) {
    return NextResponse.json({ error: "Insert failed." }, { status: 500 });
  }

  const base = new URL(request.url);
  const path = `/api/eval/artifacts/${row.id}?t=${encodeURIComponent(rawToken)}`;
  const retrievalUrl = `${base.origin}${path}`;

  return NextResponse.json({
    id: row.id,
    retrievalToken: rawToken,
    retrievalPath: path,
    retrievalUrl,
    hint: getEvalArtifactAdminSecret()
      ? "Store retrievalUrl now; the token is not saved on the server."
      : "Dev mode: admin secret unset — anyone can POST. Set METROVISION_EVAL_ARTIFACT_ADMIN_SECRET in production.",
  });
}
