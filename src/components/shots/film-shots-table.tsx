"use client";

import { useMemo, useState } from "react";

import { ShotsDataTable } from "@/components/shots/shots-data-table";
import {
  sortShotsForTable,
  type ShotsTableSortKey,
} from "@/lib/shots-table-sort";
import type { ShotWithDetails } from "@/lib/types";

type FilmShotsTableProps = {
  shots: ShotWithDetails[];
};

/** Film detail page: same table as browse, without film/director columns; default story order by start time. */
export function FilmShotsTable({ shots }: FilmShotsTableProps) {
  const [sortKey, setSortKey] = useState<ShotsTableSortKey | null>("startTc");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sortedShots = useMemo(() => {
    if (!sortKey) return shots;
    return sortShotsForTable(shots, sortKey, sortOrder);
  }, [shots, sortKey, sortOrder]);

  function toggleSort(key: ShotsTableSortKey) {
    if (sortKey === key) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder(
        key === "duration" || key === "startTc" || key === "confidence" ? "desc" : "asc",
      );
    }
  }

  return (
    <ShotsDataTable
      shots={sortedShots}
      sortKey={sortKey}
      sortOrder={sortOrder}
      onToggleSort={toggleSort}
      showFilmColumn={false}
      showDirectorColumn={false}
    />
  );
}
