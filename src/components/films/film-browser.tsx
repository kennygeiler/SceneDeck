"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { type ReactNode } from "react";

import { FilmCard } from "@/components/films/film-card";
import type { FilmCard as FilmCardType } from "@/lib/types";

type FilmBrowserProps = {
  films: FilmCardType[];
  availableDirectors: string[];
  shotsView: ReactNode;
};

export function FilmBrowser({
  films,
  availableDirectors,
  shotsView,
}: FilmBrowserProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeView = searchParams.get("view") ?? "films";
  const directorFilter = searchParams.get("director") ?? "";

  function setView(view: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`/browse?${params.toString()}`, { scroll: false });
  }

  function setDirector(director: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (director) {
      params.set("director", director);
    } else {
      params.delete("director");
    }
    router.replace(`/browse?${params.toString()}`, { scroll: false });
  }

  const filteredFilms = directorFilter
    ? films.filter((f) => f.director === directorFilter)
    : films;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setView("films")}
            className={`rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] transition-colors ${
              activeView === "films"
                ? "bg-[var(--color-interactive-default)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Films ({films.length})
          </button>
          <button
            type="button"
            onClick={() => setView("shots")}
            className={`rounded-full px-4 py-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] transition-colors ${
              activeView === "shots"
                ? "bg-[var(--color-interactive-default)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            Shots
          </button>
        </div>

        {/* Director filter (films view only) */}
        {activeView === "films" && availableDirectors.length > 1 ? (
          <select
            value={directorFilter}
            onChange={(e) => setDirector(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-2 font-mono text-xs text-[var(--color-text-secondary)] outline-none"
          >
            <option value="">All Directors</option>
            {availableDirectors.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeView === "films" ? (
          filteredFilms.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredFilms.map((film) => (
                <FilmCard key={film.id} film={film} />
              ))}
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--color-text-tertiary)]">
              No films match the current filter.
            </div>
          )
        ) : (
          shotsView
        )}
      </div>
    </div>
  );
}
