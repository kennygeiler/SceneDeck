"use client";

import { useState } from "react";
import Link from "next/link";

import { getMovementDisplayName, getShotSizeDisplayName, formatShotDuration } from "@/lib/shot-display";
import { getMovementTypeColor } from "@/lib/timeline-colors";
import type { ShotWithDetails, SceneWithShots } from "@/lib/types";

type FilmTimelineProps = {
  shots: ShotWithDetails[];
  scenes?: SceneWithShots[];
  compact?: boolean;
};

export function FilmTimeline({ shots, scenes, compact = false }: FilmTimelineProps) {
  const [hoveredShot, setHoveredShot] = useState<ShotWithDetails | null>(null);
  const totalDuration = shots.reduce((sum, s) => sum + s.duration, 0);

  if (shots.length === 0 || totalDuration === 0) {
    return (
      <div className="flex h-12 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-tertiary)]">
        No shots to display
      </div>
    );
  }

  // Build scene boundary positions (cumulative duration)
  const sceneBoundaries: number[] = [];
  if (scenes && scenes.length > 1) {
    let cumulative = 0;
    for (let i = 0; i < scenes.length - 1; i++) {
      cumulative += scenes[i].shots.reduce((s, shot) => s + shot.duration, 0);
      sceneBoundaries.push((cumulative / totalDuration) * 100);
    }
  }

  return (
    <div>
      <div className="relative">
        {/* Timeline bar */}
        <div
          className={`relative flex overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] ${compact ? "h-6" : "h-10"}`}
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 80%, transparent)",
          }}
        >
          {shots.map((shot) => {
            const widthPct = (shot.duration / totalDuration) * 100;
            return (
              <Link
                key={shot.id}
                href={`/shot/${shot.id}`}
                className="relative block transition-opacity hover:opacity-80"
                style={{
                  width: `${widthPct}%`,
                  minWidth: "2px",
                  backgroundColor: getMovementTypeColor(shot.metadata.movementType),
                }}
                onMouseEnter={() => setHoveredShot(shot)}
                onMouseLeave={() => setHoveredShot(null)}
              />
            );
          })}

          {/* Scene boundary dividers */}
          {sceneBoundaries.map((pct, i) => (
            <div
              key={i}
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{
                left: `${pct}%`,
                backgroundColor: "var(--color-text-primary)",
                opacity: 0.5,
              }}
            />
          ))}
        </div>

        {/* Tooltip */}
        {hoveredShot && !compact ? (
          <div
            className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-[var(--radius-lg)] border px-4 py-3"
            style={{
              backgroundColor: "var(--color-surface-secondary)",
              borderColor: "var(--color-border-default)",
            }}
          >
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {getMovementDisplayName(hoveredShot.metadata.movementType)}
            </p>
            <div className="mt-1 flex gap-3 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              <span>{getShotSizeDisplayName(hoveredShot.metadata.shotSize)}</span>
              <span>{formatShotDuration(hoveredShot.duration)}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Legend (non-compact only) */}
      {!compact ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {Array.from(new Set(shots.map((s) => s.metadata.movementType))).map(
            (type) => (
              <div key={type} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getMovementTypeColor(type) }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  {getMovementDisplayName(type)}
                </span>
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
