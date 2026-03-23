import Image from "next/image";
import Link from "next/link";

import type { FilmCard as FilmCardType } from "@/lib/types";

type FilmCardProps = {
  film: FilmCardType;
};

export function FilmCard({ film }: FilmCardProps) {
  return (
    <Link
      href={`/film/${film.id}`}
      className="group block overflow-hidden rounded-[var(--radius-xl)] border transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-xl)]"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 94%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <div className="relative aspect-[2/3] overflow-hidden border-b border-[var(--color-border-subtle)]">
        {film.posterUrl ? (
          <Image
            alt={film.title}
            src={film.posterUrl}
            fill
            sizes="(min-width: 1280px) 280px, (min-width: 640px) 50vw, 100vw"
            className="absolute inset-0 object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : null}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: film.posterUrl
              ? "linear-gradient(to top, color-mix(in oklch, var(--color-surface-primary) 95%, transparent) 0%, transparent 50%)"
              : "radial-gradient(circle at 30% 30%, color-mix(in oklch, var(--color-overlay-arrow) 18%, transparent) 0%, transparent 40%), linear-gradient(135deg, color-mix(in oklch, var(--color-surface-tertiary) 80%, transparent), color-mix(in oklch, var(--color-surface-primary) 95%, transparent))",
          }}
        />
        <div className="absolute inset-x-4 bottom-4">
          <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            {film.director}
          </p>
          <p
            className="mt-1 text-xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {film.title}
          </p>
          {film.year ? (
            <p className="mt-1 font-mono text-xs text-[var(--color-text-secondary)]">
              {film.year}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="flex gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Scenes
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              {film.sceneCount}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Shots
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              {film.shotCount}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Duration
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              {Math.round(film.totalDuration)}s
            </p>
          </div>
        </div>
        <span className="text-sm text-[var(--color-text-accent)] transition-transform duration-300 group-hover:translate-x-1">
          Analyze
        </span>
      </div>
    </Link>
  );
}
