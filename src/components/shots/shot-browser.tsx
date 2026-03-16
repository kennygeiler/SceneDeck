"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { ShotCard } from "@/components/shots/shot-card";
import { buttonVariants } from "@/components/ui/button";
import type { MockShot } from "@/lib/mock/shots";
import { MOVEMENT_TYPES, type MovementTypeSlug } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type ShotBrowserProps = {
  shots: MockShot[];
};

export function ShotBrowser({ shots }: ShotBrowserProps) {
  const [activeFilter, setActiveFilter] = useState<MovementTypeSlug | "all">("all");

  const filteredShots = useMemo(() => {
    if (activeFilter === "all") {
      return shots;
    }

    return shots.filter((shot) => shot.metadata.movementType === activeFilter);
  }, [activeFilter, shots]);

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
          Browse three demo shots wired into the hero overlay system. Filters
          are taxonomy-native, so the card grid and the shot detail route use
          the same movement definitions.
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Filter by movement type
          </p>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {filteredShots.length} of {shots.length} shots
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={cn(
              buttonVariants({ variant: activeFilter === "all" ? "default" : "outline", size: "sm" }),
              "rounded-full px-3",
            )}
          >
            All
          </button>
          {Object.values(MOVEMENT_TYPES).map((movement) => {
            const isActive = activeFilter === movement.slug;

            return (
              <button
                key={movement.slug}
                type="button"
                onClick={() => setActiveFilter(movement.slug)}
                className={cn(
                  buttonVariants({ variant: isActive ? "default" : "outline", size: "sm" }),
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
      </section>

      <AnimatePresence mode="popLayout">
        {filteredShots.length > 0 ? (
          <motion.section
            layout
            className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
          >
            {filteredShots.map((shot, index) => (
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
            key={activeFilter}
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
              No demo shots
            </p>
            <p className="mt-3 text-base text-[var(--color-text-secondary)]">
              The current mock archive does not include a{" "}
              {MOVEMENT_TYPES[activeFilter as MovementTypeSlug]?.displayName ?? activeFilter}{" "}
              sample yet.
            </p>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
