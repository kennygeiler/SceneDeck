import { NextResponse } from "next/server";

import { getFilmManifestRows, getShotsForExportByIds } from "@/db/queries";
import { getExportFilename, isExportFormat, toCsv, toPrettyJson } from "@/lib/export";
import { buildExportManifest } from "@/lib/export-manifest";
import { normalizeIngestProvenanceForManifest } from "@/lib/pipeline-provenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SHOTS = 2500;

type Body = {
  shotIds?: unknown;
  format?: unknown;
  includeManifest?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const rawIds = Array.isArray(body.shotIds) ? body.shotIds : [];
    const shotIds = rawIds
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter((id) => id.length > 0);
    if (shotIds.length === 0) {
      return NextResponse.json({ error: "shotIds must be a non-empty string array." }, { status: 400 });
    }
    if (shotIds.length > MAX_SHOTS) {
      return NextResponse.json(
        { error: `At most ${MAX_SHOTS} shots per export request.` },
        { status: 400 },
      );
    }

    const formatParam = typeof body.format === "string" ? body.format : "json";
    const format = isExportFormat(formatParam) ? formatParam : "json";
    const wantManifest = body.includeManifest === true || body.includeManifest === "true";

    const shots = await getShotsForExportByIds(shotIds);
    if (shots.length === 0) {
      return NextResponse.json({ error: "No matching shots found." }, { status: 404 });
    }

    const filename = getExportFilename(format);

    if (format === "csv") {
      return new NextResponse(toCsv(shots), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": "text/csv; charset=utf-8",
        },
      });
    }

    if (wantManifest) {
      const filmIds = [...new Set(shots.map((s) => s.filmId))];
      const filmRows = await getFilmManifestRows(filmIds);
      const manifest = buildExportManifest({
        filters: { shotIds: `${shotIds.length} ids (POST body)` },
        shotCount: shots.length,
        films: filmRows.map((f) => ({
          filmId: f.filmId,
          title: f.title,
          director: f.director,
          year: f.year ?? null,
          ingestProvenance: normalizeIngestProvenanceForManifest(f.ingestProvenance),
        })),
      });
      return new NextResponse(JSON.stringify({ manifest, shots }, null, 2), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${filename.replace(/\.json$/, "-with-manifest.json")}"`,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    return new NextResponse(toPrettyJson(shots), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("POST /api/export/shots failed.", error);
    return NextResponse.json({ error: "Export failed." }, { status: 500 });
  }
}
