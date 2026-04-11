export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  insertEvalGoldRevision,
  listEvalGoldRevisionsForFilm,
} from "@/db/boundary-tuning-queries";
import { extractCutsSecFromEvalJson } from "@/lib/eval-cut-json";

export async function GET(request: NextRequest) {
  const filmId = request.nextUrl.searchParams.get("filmId");
  if (!filmId?.trim()) {
    return Response.json({ error: "filmId query required" }, { status: 400 });
  }
  const revisions = await listEvalGoldRevisionsForFilm(filmId.trim());
  return Response.json({ revisions });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const filmId = typeof body.filmId === "string" ? body.filmId.trim() : "";
    if (!filmId) {
      return Response.json({ error: "filmId is required" }, { status: 400 });
    }
    const payload = body.payload;
    if (!payload || typeof payload !== "object") {
      return Response.json({ error: "payload is required" }, { status: 400 });
    }
    extractCutsSecFromEvalJson(payload);

    const windowStartSec =
      body.windowStartSec === null || body.windowStartSec === undefined
        ? null
        : Number(body.windowStartSec);
    const windowEndSec =
      body.windowEndSec === null || body.windowEndSec === undefined
        ? null
        : Number(body.windowEndSec);
    if (
      windowStartSec != null &&
      (!Number.isFinite(windowStartSec) || windowStartSec < 0)
    ) {
      return Response.json({ error: "Invalid windowStartSec" }, { status: 400 });
    }
    if (
      windowEndSec != null &&
      (!Number.isFinite(windowEndSec) || windowEndSec < 0)
    ) {
      return Response.json({ error: "Invalid windowEndSec" }, { status: 400 });
    }

    const replacesRevisionId =
      typeof body.replacesRevisionId === "string"
        ? body.replacesRevisionId.trim()
        : null;
    const createdBy =
      typeof body.createdBy === "string" ? body.createdBy.trim() : null;

    const revision = await insertEvalGoldRevision({
      filmId,
      windowStartSec,
      windowEndSec,
      payload: payload as Record<string, unknown>,
      replacesRevisionId: replacesRevisionId || null,
      createdBy,
    });
    if (!revision) {
      return Response.json({ error: "Insert failed" }, { status: 500 });
    }
    return Response.json({ revision }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid body";
    return Response.json({ error: msg }, { status: 400 });
  }
}
