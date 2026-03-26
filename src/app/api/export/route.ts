import { NextRequest } from "next/server";

import { getShotsForExport } from "@/db/queries";
import {
  getExportFilename,
  isExportFormat,
  toCsv,
  toPrettyJson,
} from "@/lib/export";

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

    if (format === "csv") {
      return new Response(toCsv(shots), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type": "text/csv; charset=utf-8",
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
