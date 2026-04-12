"use client";

import { motion, type Variants } from "framer-motion";

import {
  formatShotDuration,
  getBlockingDisplayName,
  getDepthDisplayName,
  getDurationCategoryDisplayName,
  getFramingDisplayName,
  getHorizontalAngleDisplayName,
  getLightingDirectionDisplayName,
  getLightingQualityDisplayName,
  getShotSizeDisplayName,
  getVerticalAngleDisplayName,
} from "@/lib/shot-display";
import type { ShotWithDetails } from "@/lib/types";

type MetadataOverlayProps = {
  shot: ShotWithDetails;
};

/** Keeps the panel above native play / timeline chrome. */
const SAFE_BOTTOM = "bottom-[max(6.25rem,16%)]" as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-0.5 border-b py-2 first:pt-0 last:border-b-0 last:pb-0"
      style={{
        borderBottomColor:
          "color-mix(in oklch, var(--color-border-subtle) 75%, transparent)",
      }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <span
        className="text-sm font-semibold leading-snug text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function MetadataOverlay({ shot }: MetadataOverlayProps) {
  const { film, metadata, duration } = shot;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-primary) 28%, transparent) 0%, transparent 55%)",
        }}
      />

      <div
        className={`absolute left-2 top-14 z-10 max-h-full w-[min(100%,20rem)] overflow-y-auto pr-1 sm:left-3 sm:top-16 ${SAFE_BOTTOM}`}
      >
        <div
          className="rounded-[var(--radius-xl)] border p-3 shadow-[var(--shadow-lg)] backdrop-blur-xl sm:p-4"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 74%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 68%, transparent)",
          }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Composition
          </p>
          <p
            className="mt-1 truncate text-sm font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {film.title}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {film.director} · {film.year}
          </p>
          <p className="mt-2 font-mono text-xs tabular-nums text-[var(--color-text-secondary)]">
            Clip length {formatShotDuration(duration)}
          </p>

          <div
            className="mt-3 border-t pt-1"
            style={{
              borderTopColor:
                "color-mix(in oklch, var(--color-border-subtle) 80%, transparent)",
            }}
          >
            <Row label="Framing" value={getFramingDisplayName(metadata.framing)} />
            <Row label="Shot size" value={getShotSizeDisplayName(metadata.shotSize)} />
            <Row label="Depth" value={getDepthDisplayName(metadata.depth)} />
            <Row label="Blocking" value={getBlockingDisplayName(metadata.blocking)} />
            <Row
              label="Lighting"
              value={`${getLightingDirectionDisplayName(metadata.lightingDirection)} · ${getLightingQualityDisplayName(metadata.lightingQuality)}`}
            />
            <Row
              label="Length category"
              value={getDurationCategoryDisplayName(metadata.durationCategory)}
            />
            <Row
              label="Camera angle"
              value={`${getVerticalAngleDisplayName(metadata.angleVertical)} · ${getHorizontalAngleDisplayName(metadata.angleHorizontal)}`}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
