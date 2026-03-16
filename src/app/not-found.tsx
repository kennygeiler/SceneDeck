"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Clapperboard, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative flex min-h-[calc(100vh-12rem)] items-center justify-center overflow-hidden py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 22% 22%, color-mix(in oklch, var(--color-overlay-arrow) 16%, transparent) 0%, transparent 24%), radial-gradient(circle at 80% 18%, color-mix(in oklch, var(--color-overlay-trajectory) 16%, transparent) 0%, transparent 26%), linear-gradient(180deg, transparent, color-mix(in oklch, var(--color-surface-secondary) 22%, transparent))",
        }}
      />

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative w-full max-w-4xl overflow-hidden rounded-[calc(var(--radius-xl)_+_10px)] border px-6 py-10 shadow-[var(--shadow-xl)] sm:px-10 sm:py-12"
        style={{
          background:
            "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 88%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 76%, transparent)",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-1/2 lg:block"
          style={{
            background:
              "repeating-linear-gradient(90deg, transparent 0 26px, color-mix(in oklch, var(--color-border-subtle) 28%, transparent) 26px 27px), linear-gradient(135deg, color-mix(in oklch, var(--color-surface-tertiary) 52%, transparent), transparent)",
            maskImage:
              "linear-gradient(90deg, transparent 0%, color-mix(in srgb, white 85%, transparent) 22%, white 100%)",
          }}
        />

        <div className="relative max-w-2xl">
          <div
            className="inline-flex size-14 items-center justify-center rounded-full border"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-overlay-badge) 14%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-overlay-badge) 34%, transparent)",
            }}
          >
            <Clapperboard
              aria-hidden="true"
              className="size-6 text-[var(--color-text-primary)]"
            />
          </div>

          <p className="mt-6 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Frame lost
          </p>
          <h1
            className="mt-3 text-4xl font-bold tracking-[var(--letter-spacing-tight)] text-[var(--color-text-primary)] sm:text-6xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Page not found
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-[var(--color-text-secondary)] sm:text-lg">
            The shot you requested is not in the current archive, or this route
            does not exist in the SceneDeck surface.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/browse"
              className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--color-interactive-default)] px-5 text-sm font-medium text-[var(--color-surface-primary)] shadow-[var(--shadow-glow)] transition-transform duration-300 hover:-translate-y-0.5 hover:bg-[var(--color-interactive-hover)]"
            >
              Explore browse
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--color-border-default)] px-5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Return home
            </Link>
          </div>
        </div>
      </motion.section>
    </main>
  );
}
