"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Movement type hex colors — same palette used in the timeline.
 */
const MOVE_COLORS: Record<string, string> = {
  static: "#4a4a5e",
  pan: "#5cb8d6",
  tilt: "#4dbaa8",
  dolly: "#4dd68a",
  truck: "#6dd64d",
  pedestal: "#99cc44",
  crane: "#d6b84d",
  boom: "#d6994d",
  zoom: "#aad64d",
  dolly_zoom: "#d66a4d",
  handheld: "#9966d6",
  steadicam: "#4d6ad6",
  drone: "#7744d6",
  aerial: "#4d99d6",
  arc: "#cc44d6",
  whip_pan: "#d6445a",
  whip_tilt: "#d64488",
  rack_focus: "#44d6bb",
  follow: "#44d699",
  reveal: "#44d666",
  reframe: "#6666aa",
};

/* ------------------------------------------------------------------ */
/*  ShotBadge                                                          */
/* ------------------------------------------------------------------ */

interface ShotBadgeProps {
  shotId: string;
  movementType: string;
  filmTitle: string;
}

export function ShotBadge({ shotId, movementType, filmTitle }: ShotBadgeProps) {
  const color = MOVE_COLORS[movementType] ?? MOVE_COLORS.static;
  const label = movementType.replace(/_/g, " ");

  return (
    <Link
      href={`/shot/${shotId}`}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
      style={{
        borderColor: `color-mix(in oklch, ${color} 50%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span style={{ color }}>{label}</span>
      <span className="text-[var(--color-text-tertiary)]">{filmTitle}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  FilmBadge                                                          */
/* ------------------------------------------------------------------ */

interface FilmBadgeProps {
  filmTitle: string;
}

export function FilmBadge({ filmTitle }: FilmBadgeProps) {
  return (
    <Link
      href={`/browse?filmTitle=${encodeURIComponent(filmTitle)}`}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
      style={{
        borderColor:
          "color-mix(in oklch, var(--color-accent-base) 40%, transparent)",
        backgroundColor:
          "color-mix(in oklch, var(--color-accent-base) 8%, transparent)",
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="shrink-0 opacity-70"
        aria-hidden="true"
      >
        <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3zm2 0v2h2V3H4zm4 0v2h2V3H8zm4 0h-1v2h2V3h-1zM4 7v2h8V7H4zm0 4v2h2v-2H4zm4 0v2h2v-2H8zm3 0v2h1v-2h-1z" />
      </svg>
      <span>{filmTitle}</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  ComparisonTable                                                    */
/* ------------------------------------------------------------------ */

interface ComparisonTableProps {
  data: {
    headers: string[];
    rows: Array<{ label: string; values: Array<string | number> }>;
  };
}

export function ComparisonTable({ data }: ComparisonTableProps) {
  return (
    <div className="my-3 overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 60%, transparent)",
            }}
          >
            <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Metric
            </th>
            {data.headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr
              key={row.label}
              className="border-t border-[var(--color-border-default)]"
            >
              <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                {row.label}
              </td>
              {row.values.map((val, i) => (
                <td
                  key={i}
                  className="px-3 py-2 font-mono text-[var(--color-text-primary)]"
                >
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  parseAgentMessage                                                  */
/* ------------------------------------------------------------------ */

/**
 * Parses agent message text and replaces inline shot / film references
 * with interactive badge components.
 *
 * Supported patterns:
 *   [SHOT:uuid:movementType:filmTitle]
 *   [FILM:title]
 */
export function parseAgentMessage(text: string): ReactNode[] {
  const pattern =
    /\[SHOT:([^:]+):([^:]+):([^\]]+)\]|\[FILM:([^\]]+)\]/g;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Push preceding text
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] && match[2] && match[3]) {
      // SHOT badge
      nodes.push(
        <ShotBadge
          key={`shot-${match.index}`}
          shotId={match[1]}
          movementType={match[2]}
          filmTitle={match[3]}
        />,
      );
    } else if (match[4]) {
      // FILM badge
      nodes.push(
        <FilmBadge key={`film-${match.index}`} filmTitle={match[4]} />,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
