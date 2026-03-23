"use client";

import { getMovementDisplayName, getShotSizeDisplayName } from "@/lib/shot-display";
import { getMovementTypeColor } from "@/lib/timeline-colors";
import type { FilmCoverageStats as FilmCoverageStatsType } from "@/lib/types";
import type { MovementTypeSlug, ShotSizeSlug } from "@/lib/taxonomy";

type Props = {
  stats: FilmCoverageStatsType;
};

export function FilmCoverageStats({ stats }: Props) {
  const movementEntries = Object.entries(stats.movementTypeFrequency)
    .sort(([, a], [, b]) => b - a);
  const shotSizeEntries = Object.entries(stats.shotSizeDistribution)
    .sort(([, a], [, b]) => b - a);

  const maxMovement = Math.max(...movementEntries.map(([, v]) => v), 1);
  const maxShotSize = Math.max(...shotSizeEntries.map(([, v]) => v), 1);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {/* Movement Type Distribution */}
      <div
        className="rounded-[var(--radius-xl)] border p-6"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <h3
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]"
        >
          Movement Types
        </h3>
        <div className="mt-4 space-y-3">
          {movementEntries.map(([slug, count]) => (
            <div key={slug}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {getMovementDisplayName(slug as MovementTypeSlug)}
                </span>
                <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                  {count}
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 80%, transparent)",
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(count / maxMovement) * 100}%`,
                    backgroundColor: getMovementTypeColor(slug as MovementTypeSlug),
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shot Size Distribution */}
      <div
        className="rounded-[var(--radius-xl)] border p-6"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <h3
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-overlay-trajectory)]"
        >
          Shot Sizes
        </h3>
        <div className="mt-4 space-y-3">
          {shotSizeEntries.map(([slug, count]) => (
            <div key={slug}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {getShotSizeDisplayName(slug as ShotSizeSlug)}
                </span>
                <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                  {count}
                </span>
              </div>
              <div
                className="mt-1 h-2 overflow-hidden rounded-full"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 80%, transparent)",
                }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(count / maxShotSize) * 100}%`,
                    backgroundColor: "var(--color-overlay-trajectory)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div
        className="rounded-[var(--radius-xl)] border p-6 sm:col-span-2"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <h3
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
        >
          Coverage Summary
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <p className="text-3xl font-bold text-[var(--color-text-primary)]">
              {stats.shotCount}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Total shots
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[var(--color-text-primary)]">
              {stats.sceneCount}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Scenes
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[var(--color-text-primary)]">
              {stats.averageShotLength.toFixed(1)}s
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Avg shot length
            </p>
          </div>
          <div>
            <p className="text-3xl font-bold text-[var(--color-text-primary)]">
              {movementEntries.length}
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Movement types used
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
