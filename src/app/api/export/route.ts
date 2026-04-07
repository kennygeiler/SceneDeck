import { NextRequest } from "next/server";

import { getFilmManifestRows, getShotsForExport } from "@/db/queries";
import {
  getExportFilename,
  isExportFormat,
  toCsv,
  toPrettyJson,
} from "@/lib/export";
import { buildExportManifest } from "@/lib/export-manifest";
import type { IngestProvenancePayload } from "@/lib/pipeline-provenance";

function getParamValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || undefined;
}

export async function GET(request: NextRequest) {
  try {
    const formatParam = request.nextUrl.searchParams.get("format");
    const format = isExportFormat(formatParam) ? formatParam : "json";
    const filters = {
      framing: getParamValue(request.nextUrl.searchParams, "framing"),
      director: getParamValue(request.nextUrl.searchParams, "director"),
      filmTitle: getParamValue(request.nextUrl.searchParams, "filmTitle"),
      shotSize: getParamValue(request.nextUrl.searchParams, "shotSize"),
    };
    const shots = await getShotsForExport(filters);
    const filename = getExportFilename(format);
    const wantManifest =
      request.nextUrl.searchParams.get("includeManifest") === "1" ||
      request.nextUrl.searchParams.get("includeManifest") === "true";

    if (format === "csv") {
      return new Response(toCsv(shots), {
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
        filters,
        shotCount: shots.length,
        films: filmRows.map((f) => ({
          filmId: f.filmId,
          title: f.title,
          director: f.director,
          year: f.year ?? null,
          ingestProvenance: (f.ingestProvenance ?? null) as IngestProvenancePayload | null,
        })),
      });
      const body = JSON.stringify({ manifest, shots }, null, 2);
      return new Response(body, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${filename.replace(".json", "-with-manifest.json")}"`,
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    return new Response(toPrettyJson(shots), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Failed to export shots.", error);

    return Response.json(
      { error: "Failed to export shots." },
      { status: 500 },
    );
  }
}
