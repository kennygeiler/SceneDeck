import Link from "next/link";

import { FilmTimeline } from "@/components/films/film-timeline";
import { getFramingDisplayName } from "@/lib/shot-display";
import type { SceneWithShots } from "@/lib/types";

type SceneCardProps = {
  scene: SceneWithShots;
};

export function SceneCard({ scene }: SceneCardProps) {
  const dominantFraming = getDominantFraming(scene);

  return (
    <div
      className="overflow-hidden rounded-[var(--radius-xl)] border p-6 transition-colors"
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-[var(--color-text-accent)]">
              {String(scene.sceneNumber).padStart(2, "0")}
            </span>
            <h3
              className="text-lg font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {scene.title ?? `Scene ${scene.sceneNumber}`}
            </h3>
          </div>
          {scene.description ? (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {scene.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-4 text-right">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Shots
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
              {scene.shotCount}
            </p>
          </div>
          {scene.totalDuration ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Duration
              </p>
              <p className="mt-1 text-lg font-bold text-[var(--color-text-primary)]">
                {Math.round(scene.totalDuration)}s
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Scene metadata tags */}
      <div className="mt-4 flex flex-wrap gap-2">
        {scene.location ? (
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-tertiary) 60%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            {scene.location}
          </span>
        ) : null}
        {scene.timeOfDay ? (
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-signal-amber) 12%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-signal-amber) 40%, transparent)",
            }}
          >
            {scene.timeOfDay}
          </span>
        ) : null}
        {scene.interiorExterior ? (
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-tertiary) 60%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            {scene.interiorExterior}
          </span>
        ) : null}
        {dominantFraming ? (
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-overlay-arrow) 28%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-overlay-arrow) 82%, transparent)",
            }}
          >
            {dominantFraming}
          </span>
        ) : null}
      </div>

      {/* Mini timeline */}
      {scene.shots.length > 0 ? (
        <div className="mt-4">
          <FilmTimeline shots={scene.shots} compact />
        </div>
      ) : null}

      {/* Shot links */}
      {scene.shots.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {scene.shots.map((shot, idx) => (
            <Link
              key={shot.id}
              href={`/shot/${shot.id}`}
              className="rounded-[var(--radius-md)] border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-text-accent)] hover:text-[var(--color-text-accent)]"
              style={{
                borderColor:
                  "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
              }}
            >
              Shot {idx + 1} &middot; {getFramingDisplayName(shot.metadata.framing)}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getDominantFraming(scene: SceneWithShots): string | null {
  if (scene.shots.length === 0) return null;
  const freq = new Map<string, number>();
  for (const shot of scene.shots) {
    const key = shot.metadata.framing;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let max = 0;
  let dominant = "";
  for (const [key, count] of freq) {
    if (count > max) {
      max = count;
      dominant = key;
    }
  }
  return dominant ? getFramingDisplayName(dominant as Parameters<typeof getFramingDisplayName>[0]) : null;
}
