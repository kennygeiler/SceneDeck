"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MetadataOverlay } from "@/components/video/metadata-overlay";
import type { MockShot } from "@/lib/mock/shots";

type ShotPlayerProps = {
  shot: MockShot;
};

const legendItems = [
  {
    label: "Motion vector",
    color: "var(--color-overlay-arrow)",
  },
  {
    label: "Shot scale / compound path",
    color: "var(--color-overlay-trajectory)",
  },
  {
    label: "Speed telemetry",
    color: "var(--color-overlay-speed)",
  },
  {
    label: "Badge system",
    color: "var(--color-overlay-badge)",
  },
] as const;

export function ShotPlayer({ shot }: ShotPlayerProps) {
  const [showOverlay, setShowOverlay] = useState(true);

  return (
    <div className="space-y-4">
      <div
        className="relative aspect-video overflow-hidden rounded-[calc(var(--radius-xl)_+_6px)] border shadow-[var(--shadow-xl)]"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-secondary) 88%, transparent), color-mix(in oklch, var(--color-surface-primary) 92%, transparent))",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, color-mix(in oklch, var(--color-overlay-arrow) 18%, transparent) 0%, transparent 24%), radial-gradient(circle at 82% 22%, color-mix(in oklch, var(--color-overlay-trajectory) 18%, transparent) 0%, transparent 20%), linear-gradient(180deg, color-mix(in oklch, var(--color-surface-primary) 18%, transparent), color-mix(in oklch, var(--color-surface-primary) 52%, transparent)), repeating-linear-gradient(90deg, transparent 0 79px, color-mix(in oklch, var(--color-border-subtle) 28%, transparent) 79px 80px), repeating-linear-gradient(180deg, transparent 0 79px, color-mix(in oklch, var(--color-border-subtle) 28%, transparent) 79px 80px)",
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-xl"
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Playback placeholder
            </p>
            <h2
              className="mt-3 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-3xl"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {shot.film.title}
            </h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)] sm:text-base">
              The M2 overlay is live on top of a synthetic plate so motion,
              angle, speed, and compound movement states can be reviewed before
              video ingestion lands.
            </p>
          </motion.div>
        </div>

        <div className="absolute right-4 top-4 z-30">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full border-[var(--color-border-default)] px-3 text-[var(--color-text-primary)] backdrop-blur-xl hover:bg-[var(--color-surface-tertiary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 58%, transparent)",
            }}
            onClick={() => setShowOverlay((current) => !current)}
          >
            {showOverlay ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {showOverlay ? "Hide overlay" : "Show overlay"}
          </Button>
        </div>

        {showOverlay ? <MetadataOverlay shot={shot} /> : null}
      </div>

      <div
        className="rounded-[var(--radius-xl)] border p-4"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 74%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Overlay legend
          </p>
          <span className="text-sm text-[var(--color-text-secondary)]">
            Color channels map the overlay layer to movement analysis primitives.
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {legendItems.map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.35, delay: index * 0.06, ease: "easeOut" }}
              className="flex items-center gap-3 rounded-full border px-3 py-2"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-primary) 64%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full shadow-[var(--shadow-glow)]"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                {item.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
