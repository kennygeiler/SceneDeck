import type { ShotWithDetails } from "@/lib/types";

export const SHOTS_TABLE_SORT_KEYS = [
  "film",
  "director",
  "framing",
  "shotSize",
  "duration",
  "startTc",
  "reviewStatus",
  "confidence",
  "created",
] as const;

export type ShotsTableSortKey = (typeof SHOTS_TABLE_SORT_KEYS)[number];

export function isShotsTableSortKey(value: string | null): value is ShotsTableSortKey {
  return value != null && SHOTS_TABLE_SORT_KEYS.includes(value as ShotsTableSortKey);
}

export function sortShotsForTable(
  shots: ShotWithDetails[],
  key: ShotsTableSortKey,
  order: "asc" | "desc",
): ShotWithDetails[] {
  const mul = order === "asc" ? 1 : -1;
  const num = (v: number | null | undefined) =>
    v != null && Number.isFinite(v) ? v : order === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  const str = (v: string | null | undefined) => (v ?? "").toLowerCase();

  return [...shots].sort((a, b) => {
    let c = 0;
    switch (key) {
      case "film":
        c = str(a.film.title).localeCompare(str(b.film.title), undefined, { sensitivity: "base" });
        break;
      case "director":
        c = str(a.film.director).localeCompare(str(b.film.director), undefined, { sensitivity: "base" });
        break;
      case "framing":
        c = str(a.metadata.framing).localeCompare(str(b.metadata.framing), undefined, { sensitivity: "base" });
        break;
      case "shotSize":
        c = str(a.metadata.shotSize).localeCompare(str(b.metadata.shotSize), undefined, { sensitivity: "base" });
        break;
      case "duration":
        c = num(a.duration) - num(b.duration);
        break;
      case "startTc":
        c = num(a.startTc) - num(b.startTc);
        break;
      case "reviewStatus":
        c = str(a.metadata.reviewStatus).localeCompare(str(b.metadata.reviewStatus), undefined, {
          sensitivity: "base",
        });
        break;
      case "confidence": {
        const ac = a.metadata.confidence;
        const bc = b.metadata.confidence;
        const na = ac != null && Number.isFinite(ac) ? ac : null;
        const nb = bc != null && Number.isFinite(bc) ? bc : null;
        if (na == null && nb == null) return 0;
        if (na == null) return 1;
        if (nb == null) return -1;
        c = na - nb;
        break;
      }
      case "created":
        c = str(a.createdAt).localeCompare(str(b.createdAt), undefined, { sensitivity: "base" });
        break;
      default:
        return 0;
    }
    return c * mul;
  });
}
