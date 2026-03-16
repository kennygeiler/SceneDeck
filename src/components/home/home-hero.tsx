"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { buttonVariants } from "@/components/ui/button";
import {
  DIRECTIONS,
  MOVEMENT_TYPES,
  SHOT_SIZES,
  SPEEDS,
} from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const featuredMovements = Object.values(MOVEMENT_TYPES).slice(0, 6);
const featuredDirections = Object.values(DIRECTIONS).slice(0, 4);
const featuredSizes = Object.values(SHOT_SIZES).slice(4, 8);

const stats = [
  { value: Object.keys(MOVEMENT_TYPES).length, label: "movement types" },
  { value: Object.keys(DIRECTIONS).length, label: "direction vectors" },
  { value: Object.keys(SPEEDS).length, label: "speed classes" },
] as const;

export function HomeHero() {
  return (
    <section className="grid min-h-[calc(100vh-11rem)] items-center gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(21rem,0.85fr)]">
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="max-w-3xl"
      >
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
          Playback-aware shot intelligence
        </p>
        <h1
          className="mt-4 text-5xl font-bold tracking-[var(--letter-spacing-tight)] text-[var(--color-text-primary)] sm:text-6xl lg:text-8xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          SceneDeck
        </h1>
        <p className="mt-4 text-xl text-[var(--color-text-accent)] sm:text-2xl">
          The intelligence layer for cinema
        </p>
        <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)] sm:text-lg">
          Search iconic shots through structured camera motion metadata,
          verification states, and taxonomy-aware overlays designed for film
          analysis, editorial reference, and dataset curation.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/browse"
            className={cn(
              buttonVariants({ size: "lg" }),
              "rounded-full px-5 shadow-[var(--shadow-glow)]",
            )}
          >
            Browse Shots
          </Link>
          <div className="flex items-center gap-3 text-sm text-[var(--color-text-tertiary)]">
            <span className="h-px w-12 bg-[var(--color-border-default)]" />
            Catalog motion, speed, direction, and shot scale in one system.
          </div>
        </div>

        <form
          action="/browse"
          method="GET"
          className="mt-8 rounded-[var(--radius-xl)] border p-3 shadow-[var(--shadow-lg)]"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 92%, transparent))",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <label
            htmlFor="hero-search"
            className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
          >
            Search the archive
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="hero-search"
              name="q"
              type="search"
              placeholder="Kubrick, dolly, whip pan..."
              className="h-11 flex-1 rounded-full border px-4 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-text-accent)]"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-primary) 70%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
              }}
            />
            <button
              type="submit"
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full px-5 sm:min-w-36",
              )}
            >
              Search Browse
            </button>
          </div>
        </form>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.08, ease: "easeOut" }}
        className="relative"
      >
        <div
          className="overflow-hidden rounded-[var(--radius-xl)] border p-5 shadow-[var(--shadow-xl)] sm:p-6"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 88%, transparent), color-mix(in oklch, var(--color-surface-primary) 92%, transparent))",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
          }}
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Active taxonomy
              </p>
              <h2
                className="mt-2 text-2xl font-semibold tracking-[var(--letter-spacing-snug)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Metadata surface
              </h2>
            </div>
            <div className="rounded-full border border-[var(--color-border-default)] px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-status-verified)]">
              v1
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: 0.18 + index * 0.08,
                  ease: "easeOut",
                }}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 78%, transparent)",
                }}
              >
                <div className="font-mono text-2xl text-[var(--color-text-accent)]">
                  {stat.value}
                </div>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4">
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-overlay-arrow)]">
                Motion
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {featuredMovements.map((movement) => (
                  <span
                    key={movement.slug}
                    className="rounded-full border border-[var(--color-border-default)] px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
                  >
                    {movement.displayName}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4">
                <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-overlay-trajectory)]">
                  Direction
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {featuredDirections.map((direction) => (
                    <span
                      key={direction.slug}
                      className="rounded-full border border-[var(--color-border-default)] px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
                    >
                      {direction.displayName}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4">
                <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-overlay-badge)]">
                  Shot size
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {featuredSizes.map((size) => (
                    <span
                      key={size.slug}
                      className="rounded-full border border-[var(--color-border-default)] px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
                    >
                      {size.displayName}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
