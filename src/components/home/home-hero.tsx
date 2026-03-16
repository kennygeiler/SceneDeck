"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Clapperboard, Radar, Workflow } from "lucide-react";

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

const heroSignals = [
  {
    label: "Overlay fidelity",
    value: "SVG motion telemetry",
    icon: Radar,
    accent: "var(--color-overlay-arrow)",
  },
  {
    label: "Archive surface",
    value: "Searchable Neon records",
    icon: Clapperboard,
    accent: "var(--color-overlay-trajectory)",
  },
  {
    label: "Pipeline",
    value: "Ingest → Analyze → Explore",
    icon: Workflow,
    accent: "var(--color-overlay-badge)",
  },
] as const;

export function HomeHero() {
  return (
    <section className="relative grid min-h-[calc(100vh-10rem)] items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)] lg:gap-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem]"
        style={{
          background:
            "radial-gradient(circle at 12% 18%, color-mix(in oklch, var(--color-accent-base) 22%, transparent) 0%, transparent 24%), radial-gradient(circle at 72% 8%, color-mix(in oklch, var(--color-signal-violet) 18%, transparent) 0%, transparent 20%), radial-gradient(circle at 42% 58%, color-mix(in oklch, var(--color-overlay-badge) 10%, transparent) 0%, transparent 26%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="max-w-4xl"
      >
        <div
          className="inline-flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 74%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full shadow-[var(--shadow-glow)]"
            style={{ backgroundColor: "var(--color-status-verified)" }}
          />
          Production surface for camera-motion intelligence
        </div>

        <h1
          className="mt-6 max-w-5xl text-5xl font-bold tracking-[var(--letter-spacing-tight)] text-[var(--color-text-primary)] sm:text-6xl lg:text-8xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          The intelligence layer for cinema.
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--color-text-secondary)] sm:text-xl">
          SceneDeck turns film scenes into a searchable, verification-aware
          archive of camera movement, shot scale, angle, and speed, all surfaced
          through a playback-synced visual overlay.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="/browse"
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full px-6 text-sm shadow-[var(--shadow-glow)] sm:text-base",
              )}
            >
              Explore archive
              <ArrowRight aria-hidden="true" />
            </Link>
          </motion.div>
          <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="#featured"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "rounded-full border-[var(--color-border-default)] px-6 text-sm text-[var(--color-text-primary)] backdrop-blur-xl sm:text-base",
              )}
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-secondary) 52%, transparent)",
              }}
            >
              View featured shots
            </Link>
          </motion.div>
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Live database records. Portfolio-grade presentation.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {heroSignals.map((signal, index) => {
            const Icon = signal.icon;

            return (
              <motion.div
                key={signal.label}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.12 + index * 0.07,
                  ease: "easeOut",
                }}
                className="rounded-[var(--radius-xl)] border p-4"
                style={{
                  background:
                    "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 80%, transparent), color-mix(in oklch, var(--color-surface-primary) 94%, transparent))",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 items-center justify-center rounded-full border"
                    style={{
                      backgroundColor:
                        "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
                      borderColor:
                        "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                    }}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      style={{ color: signal.accent }}
                    />
                  </span>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                      {signal.label}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                      {signal.value}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.08, ease: "easeOut" }}
        className="relative"
      >
        <div
          className="absolute -inset-6 rounded-[calc(var(--radius-xl)_+_18px)] blur-3xl"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(circle at 30% 28%, color-mix(in oklch, var(--color-accent-base) 18%, transparent), transparent 48%), radial-gradient(circle at 78% 20%, color-mix(in oklch, var(--color-signal-violet) 16%, transparent), transparent 42%)",
          }}
        />
        <div
          className="relative overflow-hidden rounded-[calc(var(--radius-xl)_+_4px)] border p-5 shadow-[var(--shadow-xl)] sm:p-6"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 90%, transparent), color-mix(in oklch, var(--color-surface-primary) 94%, transparent))",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-70"
            style={{
              background:
                "repeating-linear-gradient(90deg, transparent 0 72px, color-mix(in oklch, var(--color-border-subtle) 22%, transparent) 72px 73px), repeating-linear-gradient(180deg, transparent 0 72px, color-mix(in oklch, var(--color-border-subtle) 18%, transparent) 72px 73px)",
            }}
          />

          <div className="relative flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Cinematic telemetry canvas
              </p>
              <h2
                className="mt-2 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Metadata surface
              </h2>
            </div>
            <div className="rounded-full border border-[var(--color-border-default)] px-3 py-1 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-status-verified)]">
              Live schema
            </div>
          </div>

          <div className="relative mt-6 grid gap-4 sm:grid-cols-3">
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
                className="rounded-[var(--radius-lg)] border p-4"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 76%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
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

          <div className="relative mt-6 rounded-[var(--radius-xl)] border p-5">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-[var(--radius-xl)]"
              style={{
                background:
                  "radial-gradient(circle at 22% 26%, color-mix(in oklch, var(--color-overlay-arrow) 16%, transparent) 0%, transparent 18%), radial-gradient(circle at 76% 22%, color-mix(in oklch, var(--color-overlay-trajectory) 18%, transparent) 0%, transparent 18%), linear-gradient(135deg, color-mix(in oklch, var(--color-surface-primary) 38%, transparent), color-mix(in oklch, var(--color-surface-secondary) 64%, transparent))",
              }}
            />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Overlay signal
                </p>
                <p className="mt-2 text-base text-[var(--color-text-secondary)]">
                  Vector, trajectory, and speed channels are readable at a glance.
                </p>
              </div>
              <div className="hidden gap-2 sm:flex">
                <span
                  className="h-2.5 w-10 rounded-full"
                  style={{ backgroundColor: "var(--color-overlay-arrow)" }}
                />
                <span
                  className="h-2.5 w-10 rounded-full"
                  style={{ backgroundColor: "var(--color-overlay-trajectory)" }}
                />
                <span
                  className="h-2.5 w-10 rounded-full"
                  style={{ backgroundColor: "var(--color-overlay-speed)" }}
                />
              </div>
            </div>

            <div className="relative mt-6 grid gap-4">
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
        </div>
      </motion.div>
    </section>
  );
}
