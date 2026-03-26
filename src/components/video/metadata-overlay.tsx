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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.12,
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  },
};

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
            "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--color-overlay-arrow) 10%, transparent) 0%, transparent 48%), linear-gradient(180deg, color-mix(in oklch, var(--color-surface-primary) 16%, transparent), color-mix(in oklch, var(--color-surface-primary) 52%, transparent))",
        }}
      />

      {/* Top bar — film info */}
      <motion.div
        variants={itemVariants}
        className="absolute left-4 right-4 top-4 rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-xl"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-primary) 56%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p
              className="text-sm font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {film.title}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {film.director} · {film.year}
            </p>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            MetroVision composition overlay
          </div>
        </div>
      </motion.div>

      {/* Top-left — framing + depth */}
      <motion.div
        variants={itemVariants}
        className="absolute left-5 top-24 flex flex-wrap items-center gap-3"
      >
        <div
          className="flex items-center gap-3 rounded-full border px-4 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-overlay-arrow) 32%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-overlay-arrow) 82%, transparent)",
          }}
        >
          <div>
            <p
              className="text-xs uppercase tracking-[var(--letter-spacing-wide)]"
              style={{ color: "color-mix(in oklch, var(--color-text-primary) 70%, transparent)" }}
            >
              Framing
            </p>
            <p
              className="text-sm font-semibold text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {getFramingDisplayName(metadata.framing)}
            </p>
          </div>
        </div>

        <div
          className="rounded-full border px-3 py-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] backdrop-blur-xl"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 54%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          Depth: {getDepthDisplayName(metadata.depth)}
        </div>

        <div
          className="rounded-full border px-3 py-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] backdrop-blur-xl"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 54%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          Blocking: {getBlockingDisplayName(metadata.blocking)}
        </div>
      </motion.div>

      {/* Top-right — shot size */}
      <motion.div
        variants={itemVariants}
        className="absolute right-5 top-24 rounded-full border px-4 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-overlay-trajectory) 30%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-overlay-trajectory) 80%, transparent)",
        }}
      >
        <p
          className="text-xs uppercase tracking-[var(--letter-spacing-wide)]"
          style={{ color: "color-mix(in oklch, var(--color-text-primary) 70%, transparent)" }}
        >
          Shot size
        </p>
        <p
          className="text-sm font-semibold text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {getShotSizeDisplayName(metadata.shotSize)}
        </p>
      </motion.div>

      {/* Bottom-left — lighting info */}
      <motion.div variants={itemVariants} className="absolute bottom-5 left-5">
        <div
          className="w-44 rounded-[var(--radius-lg)] border p-3 shadow-[var(--shadow-md)] backdrop-blur-xl"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 58%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Lighting
            </p>
            <p className="font-mono text-xs text-[var(--color-overlay-speed)]">
              {getLightingDirectionDisplayName(metadata.lightingDirection)}
            </p>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            {getLightingQualityDisplayName(metadata.lightingQuality)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {getDurationCategoryDisplayName(metadata.durationCategory)}
          </p>
        </div>
      </motion.div>

      {/* Bottom-center — duration */}
      <motion.div
        variants={itemVariants}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border px-4 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-primary) 62%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <p className="font-mono text-sm uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]">
          {formatShotDuration(duration)}
        </p>
      </motion.div>

      {/* Bottom-right — camera angle */}
      <motion.div variants={itemVariants} className="absolute bottom-5 right-5">
        <div
          className="rounded-[var(--radius-lg)] border px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur-xl"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 60%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Camera angle
          </p>
          <div className="mt-2 space-y-1 text-right">
            <p className="font-mono text-xs text-[var(--color-text-primary)]">
              V: {getVerticalAngleDisplayName(metadata.angleVertical)}
            </p>
            <p className="font-mono text-xs text-[var(--color-text-primary)]">
              H: {getHorizontalAngleDisplayName(metadata.angleHorizontal)}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
