"use client";

import type { ReactNode } from "react";
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

/** Keeps labels above native play / timeline chrome (varies by browser). */
const SAFE_BOTTOM =
  "bottom-[max(6.25rem,16%)]" as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.06,
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
  },
};

function OverlayCard({
  label,
  children,
  align = "left",
}: {
  label: string;
  children: ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`max-w-full rounded-[var(--radius-lg)] border px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl sm:px-3.5 sm:py-2.5 ${align === "right" ? "text-right" : "text-left"}`}
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--color-surface-primary) 68%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 70%, transparent)",
      }}
    >
      <p className="text-[10px] font-medium uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <div
        className="mt-0.5 text-sm font-semibold leading-snug text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {children}
      </div>
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
            "linear-gradient(90deg, color-mix(in oklch, var(--color-surface-primary) 22%, transparent) 0%, transparent 38%, transparent 62%, color-mix(in oklch, var(--color-surface-primary) 22%, transparent) 100%)",
        }}
      />

      {/* Left column — stacks top to bottom, stops above controls */}
      <div
        className={`absolute left-2 top-2 z-10 flex w-[min(48%,17.5rem)] flex-col gap-2 overflow-y-auto pr-1 sm:left-3 sm:top-3 ${SAFE_BOTTOM}`}
      >
        <motion.div variants={itemVariants}>
          <OverlayCard label="Film" align="left">
            <span className="block truncate">{film.title}</span>
            <span className="mt-0.5 block text-xs font-normal text-[var(--color-text-secondary)]">
              {film.director} · {film.year}
            </span>
          </OverlayCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <OverlayCard label="Framing" align="left">
            {getFramingDisplayName(metadata.framing)}
          </OverlayCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <OverlayCard label="Depth" align="left">
            {getDepthDisplayName(metadata.depth)}
          </OverlayCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <OverlayCard label="Blocking" align="left">
            {getBlockingDisplayName(metadata.blocking)}
          </OverlayCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <OverlayCard label="Lighting" align="left">
            <span className="block">{getLightingDirectionDisplayName(metadata.lightingDirection)}</span>
            <span className="mt-1 block text-xs font-normal text-[var(--color-text-secondary)]">
              {getLightingQualityDisplayName(metadata.lightingQuality)}
            </span>
          </OverlayCard>
        </motion.div>
      </div>

      {/* Right column — right-aligned stack */}
      <div
        className={`absolute right-2 top-14 z-10 flex w-[min(48%,17.5rem)] flex-col items-end gap-2 overflow-y-auto pl-1 sm:right-3 sm:top-16 ${SAFE_BOTTOM}`}
      >
        <motion.div variants={itemVariants}>
          <div
            className="rounded-full border px-3 py-1.5 font-mono text-xs tabular-nums text-[var(--color-text-primary)] shadow-[var(--shadow-md)] backdrop-blur-xl"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 68%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 70%, transparent)",
            }}
          >
            {formatShotDuration(duration)}
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full">
          <OverlayCard label="Shot size" align="right">
            {getShotSizeDisplayName(metadata.shotSize)}
          </OverlayCard>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full">
          <OverlayCard label="Length category" align="right">
            {getDurationCategoryDisplayName(metadata.durationCategory)}
          </OverlayCard>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full">
          <OverlayCard label="Camera angle" align="right">
            <span className="block text-xs font-normal leading-relaxed text-[var(--color-text-primary)]">
              <span className="text-[var(--color-text-secondary)]">Vertical · </span>
              {getVerticalAngleDisplayName(metadata.angleVertical)}
            </span>
            <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--color-text-primary)]">
              <span className="text-[var(--color-text-secondary)]">Horizontal · </span>
              {getHorizontalAngleDisplayName(metadata.angleHorizontal)}
            </span>
          </OverlayCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
