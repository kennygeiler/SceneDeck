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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.08,
      staggerChildren: 0.05,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
  },
};

function OverlayField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p
        className="mt-1 text-sm font-semibold leading-snug text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {children}
      </p>
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
            "linear-gradient(180deg, transparent 0%, transparent 42%, color-mix(in oklch, var(--color-surface-primary) 55%, transparent) 100%)",
        }}
      />

      {/* Context strip — stays out of the focal area */}
      <motion.div
        variants={itemVariants}
        className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl sm:left-5 sm:right-auto sm:max-w-[min(100%,28rem)]"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-primary) 62%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 70%, transparent)",
        }}
      >
        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {film.title}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {film.director} · {film.year}
          </p>
        </div>
      </motion.div>

      {/* Single readable panel — primary composition info */}
      <motion.div
        variants={itemVariants}
        className="absolute inset-x-3 bottom-3 max-h-[min(52%,20rem)] overflow-y-auto rounded-[var(--radius-xl)] border p-4 shadow-[var(--shadow-lg)] backdrop-blur-xl sm:inset-x-4 sm:bottom-4 sm:max-h-[min(48%,22rem)] sm:p-5"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 68%, transparent)",
        }}
      >
        <div
          className="flex flex-wrap items-end justify-between gap-3 border-b pb-3"
          style={{
            borderBottomColor:
              "color-mix(in oklch, var(--color-border-subtle) 80%, transparent)",
          }}
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Composition
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Labels match the archive taxonomy for this shot.
            </p>
          </div>
          <p
            className="shrink-0 rounded-full border px-3 py-1 font-mono text-xs tabular-nums text-[var(--color-text-primary)]"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 70%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            {formatShotDuration(duration)}
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <OverlayField label="Framing">{getFramingDisplayName(metadata.framing)}</OverlayField>
          <OverlayField label="Shot size">{getShotSizeDisplayName(metadata.shotSize)}</OverlayField>
          <OverlayField label="Depth">{getDepthDisplayName(metadata.depth)}</OverlayField>
          <OverlayField label="Blocking">{getBlockingDisplayName(metadata.blocking)}</OverlayField>
          <OverlayField label="Lighting direction" className="sm:col-span-2 lg:col-span-1">
            {getLightingDirectionDisplayName(metadata.lightingDirection)}
          </OverlayField>
          <OverlayField label="Lighting quality">{getLightingQualityDisplayName(metadata.lightingQuality)}</OverlayField>
          <OverlayField label="Length category">
            {getDurationCategoryDisplayName(metadata.durationCategory)}
          </OverlayField>
        </div>

        <div
          className="mt-4 rounded-[var(--radius-md)] border p-3"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 55%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
          }}
        >
          <p className="text-[11px] font-medium uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Camera angle
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-primary)]">
            <span className="text-[var(--color-text-secondary)]">Vertical: </span>
            {getVerticalAngleDisplayName(metadata.angleVertical)}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-primary)]">
            <span className="text-[var(--color-text-secondary)]">Horizontal: </span>
            {getHorizontalAngleDisplayName(metadata.angleHorizontal)}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
