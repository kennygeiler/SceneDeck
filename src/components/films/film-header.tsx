import Image from "next/image";

import type { FilmWithDetails } from "@/lib/types";

type FilmHeaderProps = {
  film: FilmWithDetails;
};

export function FilmHeader({ film }: FilmHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)]">
      {/* Backdrop */}
      {film.backdropUrl ? (
        <div className="absolute inset-0">
          <Image
            alt=""
            aria-hidden="true"
            src={film.backdropUrl}
            fill
            sizes="100vw"
            className="object-cover opacity-20"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to right, var(--color-surface-primary) 35%, transparent 100%), linear-gradient(to top, var(--color-surface-primary) 0%, transparent 60%)",
            }}
          />
        </div>
      ) : null}

      <div className="relative flex gap-8 p-8">
        {/* Poster */}
        <div className="hidden shrink-0 sm:block">
          <div className="relative h-72 w-48 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]">
            {film.posterUrl ? (
              <Image
                alt={film.title}
                src={film.posterUrl}
                fill
                sizes="192px"
                className="object-cover"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-tertiary) 80%, transparent), var(--color-surface-primary))",
                }}
              >
                <span className="font-mono text-sm text-[var(--color-text-tertiary)]">
                  No poster
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
              Film Analysis
            </p>
            <h1
              className="mt-2 text-4xl font-bold tracking-[var(--letter-spacing-tight)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {film.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-lg text-[var(--color-text-secondary)]">
                {film.director}
              </span>
              {film.year ? (
                <>
                  <span className="text-[var(--color-text-tertiary)]">&middot;</span>
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)]">
                    {film.year}
                  </span>
                </>
              ) : null}
              {film.runtime ? (
                <>
                  <span className="text-[var(--color-text-tertiary)]">&middot;</span>
                  <span className="font-mono text-sm text-[var(--color-text-tertiary)]">
                    {film.runtime} min
                  </span>
                </>
              ) : null}
            </div>
            {film.genres.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {film.genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
                    style={{
                      backgroundColor:
                        "color-mix(in oklch, var(--color-surface-tertiary) 60%, transparent)",
                      borderColor:
                        "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                    }}
                  >
                    {genre}
                  </span>
                ))}
              </div>
            ) : null}
            {film.overview ? (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {film.overview}
              </p>
            ) : null}
          </div>

          {/* Stats row */}
          <div className="mt-6 flex gap-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Scenes
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
                {film.sceneCount}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Shots
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
                {film.shotCount}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Total Duration
              </p>
              <p className="mt-1 text-2xl font-bold text-[var(--color-text-primary)]">
                {formatTotalDuration(film.totalDuration)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTotalDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}
