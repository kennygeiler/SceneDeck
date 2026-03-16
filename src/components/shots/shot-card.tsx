import Link from "next/link";

import {
  formatShotDuration,
  getMovementDisplayName,
  getShotSizeDisplayName,
} from "@/lib/shot-display";
import type { MockShot } from "@/lib/mock/shots";

type ShotCardProps = {
  shot: MockShot;
};

export function ShotCard({ shot }: ShotCardProps) {
  return (
    <Link
      href={`/shot/${shot.id}`}
      className="group block overflow-hidden rounded-[var(--radius-xl)] border transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-xl)]"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 94%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="relative aspect-video overflow-hidden border-b border-[var(--color-border-subtle)]">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 24%, color-mix(in oklch, var(--color-overlay-arrow) 18%, transparent) 0%, transparent 26%), radial-gradient(circle at 78% 18%, color-mix(in oklch, var(--color-overlay-trajectory) 20%, transparent) 0%, transparent 22%), linear-gradient(135deg, color-mix(in oklch, var(--color-surface-tertiary) 80%, transparent), color-mix(in oklch, var(--color-surface-primary) 95%, transparent))",
          }}
        />
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-overlay-arrow) 28%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-overlay-arrow) 82%, transparent)",
            }}
          >
            {getMovementDisplayName(shot.metadata.movementType)}
          </span>
          <span
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-overlay-trajectory) 26%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-overlay-trajectory) 82%, transparent)",
            }}
          >
            {getShotSizeDisplayName(shot.metadata.shotSize)}
          </span>
        </div>

        <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              {shot.film.director}
            </p>
            <p
              className="mt-1 text-lg font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {shot.film.title}
            </p>
          </div>
          <p className="font-mono text-xs text-[var(--color-text-secondary)]">
            {formatShotDuration(shot.duration)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {shot.metadata.isCompound ? "Compound movement" : "Single vector"}
          </p>
          <p className="mt-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            {shot.metadata.direction.replaceAll("_", " ")}
          </p>
        </div>
        <span className="text-sm text-[var(--color-text-accent)] transition-transform duration-300 group-hover:translate-x-1">
          Open shot
        </span>
      </div>
    </Link>
  );
}
