"use client";

import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  formatMediaClock,
  formatShotDuration,
  getFramingDisplayName,
  getShotSizeDisplayName,
} from "@/lib/shot-display";
import type { ShotsTableSortKey } from "@/lib/shots-table-sort";
import type { ShotWithDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ShotsDataTableProps = {
  shots: ShotWithDetails[];
  sortKey: ShotsTableSortKey | null;
  sortOrder: "asc" | "desc";
  onToggleSort: (key: ShotsTableSortKey) => void;
  showFilmColumn?: boolean;
  showDirectorColumn?: boolean;
};

export function ShotsDataTable({
  shots,
  sortKey,
  sortOrder,
  onToggleSort,
  showFilmColumn = true,
  showDirectorColumn = true,
}: ShotsDataTableProps) {
  const router = useRouter();

  function SortTh({
    label,
    sortK,
    className,
  }: {
    label: string;
    sortK: ShotsTableSortKey;
    className?: string;
  }) {
    const active = sortKey === sortK;
    return (
      <th
        scope="col"
        className={cn("px-3 py-3 text-left font-mono text-[10px] uppercase tracking-wide", className)}
      >
        <button
          type="button"
          onClick={() => onToggleSort(sortK)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]",
            active && "text-[var(--color-text-primary)]",
          )}
        >
          {label}
          {active ? (
            sortOrder === "asc" ? (
              <ChevronUp className="size-3.5 shrink-0 opacity-90" aria-hidden />
            ) : (
              <ChevronDown className="size-3.5 shrink-0 opacity-90" aria-hidden />
            )
          ) : (
            <ArrowUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
          )}
        </button>
      </th>
    );
  }

  const minW = showFilmColumn && showDirectorColumn ? "min-w-[920px]" : "min-w-[720px]";

  return (
    <div
      className="overflow-x-auto rounded-[var(--radius-xl)] border"
      style={{
        borderColor: "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 70%, transparent)",
      }}
    >
      <table className={cn("w-full border-collapse text-left text-sm", minW)}>
        <thead
          className="sticky top-0 z-10 border-b"
          style={{
            backgroundColor: "color-mix(in oklch, var(--color-surface-primary) 92%, transparent)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <tr>
            <th
              scope="col"
              className="w-14 px-2 py-3 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-tertiary)]"
            >
              Thumb
            </th>
            {showFilmColumn ? <SortTh label="Film" sortK="film" /> : null}
            {showDirectorColumn ? <SortTh label="Director" sortK="director" /> : null}
            <SortTh label="Framing" sortK="framing" />
            <SortTh label="Shot size" sortK="shotSize" />
            <SortTh label="Duration" sortK="duration" />
            <SortTh label="Start" sortK="startTc" />
            <SortTh label="Review" sortK="reviewStatus" />
            <SortTh label="Conf." sortK="confidence" />
            <SortTh label="Added" sortK="created" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody>
          {shots.map((shot) => {
            const href = `/shot/${shot.id}`;
            return (
              <tr
                key={shot.id}
                className="cursor-pointer border-b border-[var(--color-border-subtle)] transition-colors hover:bg-[color-mix(in_oklch,var(--color-accent-base)_6%,transparent)]"
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Open shot: ${shot.film.title}`}
              >
                <td className="px-2 py-2 align-middle">
                  <div className="relative h-10 w-16 overflow-hidden rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-tertiary)]">
                    {shot.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- table row thumbs
                      <img
                        src={shot.thumbnailUrl}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                </td>
                {showFilmColumn ? (
                  <td
                    className="max-w-[10rem] truncate px-3 py-2 align-middle font-medium text-[var(--color-text-primary)]"
                    title={shot.film.title}
                  >
                    {shot.film.title}
                  </td>
                ) : null}
                {showDirectorColumn ? (
                  <td
                    className="max-w-[8rem] truncate px-3 py-2 align-middle text-[var(--color-text-secondary)]"
                    title={shot.film.director}
                  >
                    {shot.film.director}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-3 py-2 align-middle text-[var(--color-text-secondary)]">
                  {getFramingDisplayName(shot.metadata.framing)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle text-[var(--color-text-secondary)]">
                  {getShotSizeDisplayName(shot.metadata.shotSize)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle font-mono tabular-nums text-[var(--color-text-secondary)]">
                  {formatShotDuration(shot.duration)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle font-mono tabular-nums text-[var(--color-text-secondary)]">
                  {shot.startTc != null && Number.isFinite(shot.startTc) ? formatMediaClock(shot.startTc) : "—"}
                </td>
                <td
                  className="max-w-[7rem] truncate px-3 py-2 align-middle font-mono text-[11px] text-[var(--color-text-tertiary)]"
                  title={shot.metadata.reviewStatus ?? ""}
                >
                  {shot.metadata.reviewStatus ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-middle font-mono tabular-nums text-[var(--color-text-secondary)]">
                  {shot.metadata.confidence != null && Number.isFinite(shot.metadata.confidence)
                    ? `${Math.round(shot.metadata.confidence * 100)}%`
                    : "—"}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 align-middle font-mono text-[11px] text-[var(--color-text-tertiary)] lg:table-cell">
                  {shot.createdAt
                    ? new Date(shot.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
