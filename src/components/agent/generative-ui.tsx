"use client";

/**
 * Generative UI — maps tool_result payloads to pre-registered D3/React components.
 * AC-08: No LLM-generated code evaluated. Only typed JSON → component mapping.
 * AC-09: Components receive complete data only (no partial rendering).
 */

import dynamic from "next/dynamic";
import type { VizShot } from "@/lib/types";

// Lazy-load D3 components to avoid SSR issues
const PacingHeatmap = dynamic(
  () =>
    import("@/components/visualize/pacing-heatmap").then(
      (mod) => mod.PacingHeatmap,
    ),
  { ssr: false },
);

const DirectorRadar = dynamic(
  () =>
    import("@/components/visualize/director-radar").then(
      (mod) => mod.DirectorRadar,
    ),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Type guards for tool result payloads
// ---------------------------------------------------------------------------

type VizPayload = {
  vizType: string;
  [key: string]: unknown;
};

function isVizPayload(data: unknown): data is VizPayload {
  return (
    typeof data === "object" &&
    data !== null &&
    "vizType" in data &&
    typeof (data as VizPayload).vizType === "string"
  );
}

// ---------------------------------------------------------------------------
// Shotlist table component (inline)
// ---------------------------------------------------------------------------

type ShotlistRow = {
  shotNumber: number;
  sceneNumber: number;
  sceneTitle: string | null;
  movementType: string;
  direction: string;
  shotSize: string;
  speed: string;
  duration: number;
  description: string;
};

function ShotlistTable({
  filmTitle,
  director,
  data,
}: {
  filmTitle: string;
  director: string;
  data: ShotlistRow[];
}) {
  return (
    <div className="my-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Shotlist
        </p>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          {filmTitle} — {director}
        </p>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-surface-secondary)]">
            <tr className="border-b border-[var(--color-border-subtle)]">
              <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                #
              </th>
              <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Movement
              </th>
              <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Size
              </th>
              <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Dir
              </th>
              <th className="px-3 py-2 text-right font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Dur
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-[var(--color-border-subtle)] last:border-0"
              >
                <td className="px-3 py-1.5 font-mono text-[var(--color-text-tertiary)]">
                  {row.shotNumber}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-primary)]">
                  {row.movementType.replace(/_/g, " ")}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                  {row.shotSize.replace(/_/g, " ")}
                </td>
                <td className="px-3 py-1.5 text-[var(--color-text-secondary)]">
                  {row.direction}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[var(--color-text-secondary)]">
                  {row.duration.toFixed(1)}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-2">
        <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {data.length} shots
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison table component (inline)
// ---------------------------------------------------------------------------

type ComparisonFilm = {
  title: string;
  director: string;
  year: number | null;
  shotCount: number;
  sceneCount: number;
  averageShotLength: number;
  movementTypeFrequency: Record<string, number>;
  shotSizeDistribution: Record<string, number>;
};

function ComparisonTable({ data }: { data: ComparisonFilm[] }) {
  if (data.length < 2) return null;

  return (
    <div className="my-3 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)]">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-4 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Film Comparison
        </p>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--color-border-subtle)]">
            <th className="px-3 py-2 text-left font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]" />
            {data.map((film) => (
              <th
                key={film.title}
                className="px-3 py-2 text-left text-sm font-medium text-[var(--color-text-primary)]"
              >
                {film.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ["Director", (f: ComparisonFilm) => f.director],
            ["Year", (f: ComparisonFilm) => f.year ?? "—"],
            ["Shots", (f: ComparisonFilm) => f.shotCount],
            ["Scenes", (f: ComparisonFilm) => f.sceneCount],
            [
              "Avg Shot Length",
              (f: ComparisonFilm) => `${f.averageShotLength}s`,
            ],
          ].map(([label, getter]) => (
            <tr
              key={label as string}
              className="border-b border-[var(--color-border-subtle)]"
            >
              <td className="px-3 py-1.5 font-mono uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {label as string}
              </td>
              {data.map((film) => (
                <td
                  key={film.title}
                  className="px-3 py-1.5 text-[var(--color-text-primary)]"
                >
                  {String((getter as (f: ComparisonFilm) => unknown)(film))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main renderer — maps vizType to component
// ---------------------------------------------------------------------------

export function GenerativeUIBlock({ data }: { data: unknown }) {
  if (!isVizPayload(data)) return null;

  switch (data.vizType) {
    case "pacing_heatmap":
      return (
        <div className="my-3 h-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Pacing Heatmap — {data.filmTitle as string}
          </p>
          <PacingHeatmap shots={data.data as VizShot[]} films={[]} />
        </div>
      );

    case "director_radar":
      return (
        <div className="my-3 h-72 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Director Radar — {(data.directors as string[]).join(" vs ")}
          </p>
          <DirectorRadar
            data={data.data as Record<string, Record<string, number>>}
            directors={data.directors as string[]}
          />
        </div>
      );

    case "shotlist":
      return (
        <ShotlistTable
          filmTitle={data.filmTitle as string}
          director={data.director as string}
          data={data.data as ShotlistRow[]}
        />
      );

    case "comparison_table":
      return <ComparisonTable data={data.data as ComparisonFilm[]} />;

    default:
      return null;
  }
}
