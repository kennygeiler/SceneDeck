"use client";

import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ShotCard } from "@/components/shots/shot-card";
import { buttonVariants } from "@/components/ui/button";
import {
  getShotSizeDisplayName,
} from "@/lib/shot-display";
import type { ShotWithDetails } from "@/lib/types";
import {
  MOVEMENT_TYPES,
  SHOT_SIZES,
  type MovementTypeSlug,
  type ShotSizeSlug,
} from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type ShotBrowserProps = {
  shots: ShotWithDetails[];
  totalShots: number;
  availableDirectors: string[];
  availableShotSizes: ShotSizeSlug[];
};

function filterShots(
  shots: ShotWithDetails[],
  filters: {
    movementType: string;
    director: string;
    shotSize: string;
  },
) {
  return shots.filter((shot) => {
    if (
      filters.movementType !== "all" &&
      shot.metadata.movementType !== filters.movementType
    ) {
      return false;
    }

    if (filters.director !== "all" && shot.film.director !== filters.director) {
      return false;
    }

    if (filters.shotSize !== "all" && shot.metadata.shotSize !== filters.shotSize) {
      return false;
    }

    return true;
  });
}

export function ShotBrowser({
  shots,
  totalShots,
  availableDirectors,
  availableShotSizes,
}: ShotBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const movementType = searchParams.get("movementType") ?? "all";
  const director = searchParams.get("director") ?? "all";
  const shotSize = searchParams.get("shotSize") ?? "all";
  const query = searchParams.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(query);
  const [searchResults, setSearchResults] = useState<ShotWithDetails[] | null>(
    query ? shots : null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const deferredSearchInput = useDeferredValue(searchInput);

  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;

    async function runSearch() {
      setIsSearching(true);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Search request failed.");
        }

        const results = (await response.json()) as ShotWithDetails[];

        if (!isCancelled) {
          setSearchResults(results);
        }
      } catch (error) {
        console.error(error);

        if (!isCancelled) {
          setSearchResults([]);
        }
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }

    void runSearch();

    return () => {
      isCancelled = true;
    };
  }, [query]);

  useEffect(() => {
    const normalizedInput = deferredSearchInput.trim();

    if (normalizedInput === query) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());

      if (normalizedInput) {
        params.set("q", normalizedInput);
      } else {
        params.delete("q");
      }

      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

      startTransition(() => {
        router.replace(nextUrl, { scroll: false });
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [deferredSearchInput, pathname, query, router, searchParams]);

  function updateFilter(key: "movementType" | "director" | "shotSize", value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;

    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }

  function clearFilters() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  const displayedShots = query
    ? filterShots(searchResults ?? shots, { movementType, director, shotSize })
    : shots;
  const hasActiveFilters =
    Boolean(query) ||
    movementType !== "all" ||
    director !== "all" ||
    shotSize !== "all";
  const archiveIsEmpty = totalShots === 0;

  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Archive browse
        </p>
        <h1
          className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Shot metadata, rendered as motion telemetry
        </h1>
        <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
          Browse the live Neon archive with taxonomy-native filters, URL-backed
          search state, and the same motion definitions used by the detail
          overlay.
        </p>
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-5"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full border"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-overlay-arrow) 18%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-overlay-arrow) 68%, transparent)",
              }}
            >
              <SlidersHorizontal
                aria-hidden="true"
                className="h-4 w-4 text-[var(--color-text-primary)]"
              />
            </span>
            <div>
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Archive controls
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {displayedShots.length} of {totalShots} shots visible
              </p>
            </div>
          </div>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-3")}
            >
              Clear all
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            <label
              htmlFor="browse-search"
              className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
            >
              Search title, director, movement
            </label>
            <div className="mt-3 flex items-center gap-3 rounded-full border px-4"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <Search
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]"
              />
              <input
                id="browse-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search the live archive"
                className="h-11 w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <Sparkles aria-hidden="true" className="h-4 w-4 text-[var(--color-text-accent)]" />
              <span>
                {query
                  ? isSearching
                    ? "Refreshing search matches from /api/search..."
                    : `Search synced to /browse?q=${query}`
                  : "Search updates the URL and rehydrates results from the search API."}
              </span>
            </div>
          </div>

          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Active query state
            </p>
            <div className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
              <p>Movement: {movementType === "all" ? "All" : MOVEMENT_TYPES[movementType as MovementTypeSlug]?.displayName ?? movementType}</p>
              <p>Director: {director === "all" ? "All" : director}</p>
              <p>Shot size: {shotSize === "all" ? "All" : getShotSizeDisplayName(shotSize as ShotSizeSlug)}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Movement type
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateFilter("movementType", "all")}
                className={cn(
                  buttonVariants({
                    variant: movementType === "all" ? "default" : "outline",
                    size: "sm",
                  }),
                  "rounded-full px-3",
                )}
              >
                All
              </button>
              {Object.values(MOVEMENT_TYPES).map((movement) => {
                const isActive = movementType === movement.slug;

                return (
                  <button
                    key={movement.slug}
                    type="button"
                    onClick={() => updateFilter("movementType", movement.slug)}
                    className={cn(
                      buttonVariants({
                        variant: isActive ? "default" : "outline",
                        size: "sm",
                      }),
                      "rounded-full px-3",
                      !isActive &&
                        "border-[var(--color-border-default)] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                    )}
                  >
                    {movement.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Director
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateFilter("director", "all")}
                className={cn(
                  buttonVariants({
                    variant: director === "all" ? "default" : "outline",
                    size: "sm",
                  }),
                  "rounded-full px-3",
                )}
              >
                All
              </button>
              {availableDirectors.map((directorOption) => (
                <button
                  key={directorOption}
                  type="button"
                  onClick={() => updateFilter("director", directorOption)}
                  className={cn(
                    buttonVariants({
                      variant: director === directorOption ? "default" : "outline",
                      size: "sm",
                    }),
                    "rounded-full px-3",
                    director !== directorOption &&
                      "border-[var(--color-border-default)] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                  )}
                >
                  {directorOption}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Shot size
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateFilter("shotSize", "all")}
                className={cn(
                  buttonVariants({
                    variant: shotSize === "all" ? "default" : "outline",
                    size: "sm",
                  }),
                  "rounded-full px-3",
                )}
              >
                All
              </button>
              {availableShotSizes.map((shotSizeOption) => (
                <button
                  key={shotSizeOption}
                  type="button"
                  onClick={() => updateFilter("shotSize", shotSizeOption)}
                  className={cn(
                    buttonVariants({
                      variant: shotSize === shotSizeOption ? "default" : "outline",
                      size: "sm",
                    }),
                    "rounded-full px-3",
                    shotSize !== shotSizeOption &&
                      "border-[var(--color-border-default)] bg-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                  )}
                >
                  {SHOT_SIZES[shotSizeOption].displayName}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence mode="popLayout">
        {archiveIsEmpty ? (
          <motion.section
            key="empty-archive"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-[var(--radius-xl)] border p-8"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-secondary) 74%, transparent), color-mix(in oklch, var(--color-surface-primary) 90%, transparent))",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Archive empty
            </p>
            <h2
              className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              SceneDeck is connected, but no shots have been published yet.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
              Seed the database or ingest clips through the pipeline, then the
              live archive will render here automatically with the same filter
              controls.
            </p>
          </motion.section>
        ) : displayedShots.length > 0 ? (
          <motion.section
            layout
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {displayedShots.map((shot, index) => (
              <motion.div
                key={shot.id}
                layout
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{
                  duration: 0.35,
                  delay: index * 0.05,
                  ease: "easeOut",
                }}
              >
                <ShotCard shot={shot} />
              </motion.div>
            ))}
          </motion.section>
        ) : (
          <motion.section
            key={`${query}-${movementType}-${director}-${shotSize}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-[var(--radius-xl)] border p-8 text-center"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 74%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              No matching shots
            </p>
            <h2
              className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              The live archive has no result set for the current query.
            </h2>
            <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
              Adjust the search string, switch movement filters, or clear the
              current URL params to return to the full archive.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {query ? (
                <span className="rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                  q={query}
                </span>
              ) : null}
              {movementType !== "all" ? (
                <span className="rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                  {MOVEMENT_TYPES[movementType as MovementTypeSlug]?.displayName ?? movementType}
                </span>
              ) : null}
              {director !== "all" ? (
                <span className="rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                  {director}
                </span>
              ) : null}
              {shotSize !== "all" ? (
                <span className="rounded-full border px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                  {getShotSizeDisplayName(shotSize as ShotSizeSlug)}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={clearFilters}
              className={cn(buttonVariants({ size: "sm" }), "mt-6 rounded-full px-4")}
            >
              Reset archive view
            </button>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
