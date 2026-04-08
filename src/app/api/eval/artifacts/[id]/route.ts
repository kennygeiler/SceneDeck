export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * Fetch full JSON payload. Requires correct per-artifact token (?t=).
 * Does not require admin secret — capability URL only.
 */
export async function GET(request: Request, ctx: RouteCtx) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const t = new URL(request.url).searchParams.get("t")?.trim();
  if (!t) {
    return NextResponse.json(
      { error: "Missing retrieval token. Use ?t= from the create response." },
      { status: 400 },
    );
  }

  const [row] = await db
    .select()
    .from(schema.evalArtifacts)
    .where(eq(schema.evalArtifacts.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const a = Buffer.from(hashToken(t), "hex");
  const b = Buffer.from(row.tokenHash, "hex");
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "Invalid token." }, { status: 403 });
  }

  return NextResponse.json(row.payload, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
