import type { ExportShotRecord } from "@/lib/types";

export const EXPORT_FORMATS = ["json", "csv"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_SHOT_COLUMNS = [
  "shotId",
  "filmTitle",
  "director",
  "year",
  "sourceFile",
  "startTc",
  "endTc",
  "duration",
  "videoUrl",
  "thumbnailUrl",
  "framing",
  "depth",
  "blocking",
  "symmetry",
  "dominantLines",
  "lightingDirection",
  "lightingQuality",
  "colorTemperature",
  "shotSize",
  "angleVertical",
  "angleHorizontal",
  "durationCategory",
  "classificationSource",
  "description",
  "subjects",
  "mood",
  "lighting",
  "techniqueNotes",
  "createdAt",
] as const satisfies ReadonlyArray<keyof ExportShotRecord>;

export function isExportFormat(value: string | null | undefined): value is ExportFormat {
  return value === "json" || value === "csv";
}

export function buildExportUrl(
  format: ExportFormat,
  filters?: {
    framing?: string;
    director?: string;
    filmTitle?: string;
    shotSize?: string;
  },
) {
  const params = new URLSearchParams();

  params.set("format", format);

  if (filters?.framing) {
    params.set("framing", filters.framing);
  }

  if (filters?.director) {
    params.set("director", filters.director);
  }

  if (filters?.filmTitle) {
    params.set("filmTitle", filters.filmTitle);
  }

  if (filters?.shotSize) {
    params.set("shotSize", filters.shotSize);
  }

  return `/api/export?${params.toString()}`;
}

export function triggerExportDownload(
  format: ExportFormat,
  filters?: {
    framing?: string;
    director?: string;
    filmTitle?: string;
    shotSize?: string;
  },
) {
  if (typeof document === "undefined") {
    return;
  }

  const link = document.createElement("a");

  link.href = buildExportUrl(format, filters);
  link.rel = "noopener";
  link.click();
}

export function getExportFilename(format: ExportFormat) {
  const dateStamp = new Date().toISOString().slice(0, 10);

  return `metrovision-shots-${dateStamp}.${format}`;
}

export function toPrettyJson(records: ExportShotRecord[]) {
  return JSON.stringify(records, null, 2);
}

function escapeCsvCell(value: ExportShotRecord[keyof ExportShotRecord]) {
  if (value === null || value === undefined) {
    return "";
  }

  const normalizedValue = String(value);

  if (
    normalizedValue.includes(",") ||
    normalizedValue.includes('"') ||
    normalizedValue.includes("\n") ||
    normalizedValue.includes("\r")
  ) {
    return `"${normalizedValue.replaceAll('"', '""')}"`;
  }

  return normalizedValue;
}

export function toCsv(records: ExportShotRecord[]) {
  const header = EXPORT_SHOT_COLUMNS.join(",");
  const rows = records.map((record) =>
    EXPORT_SHOT_COLUMNS.map((column) => escapeCsvCell(record[column])).join(","),
  );

  return [header, ...rows].join("\n");
}
