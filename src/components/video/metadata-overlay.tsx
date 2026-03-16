"use client";

import { motion, type Variants } from "framer-motion";

import {
  formatShotDuration,
  getCompoundNotation,
  getDirectionDisplayName,
  getDurationCategoryDisplayName,
  getHorizontalAngleDisplayName,
  getMovementDisplayName,
  getShotSizeDisplayName,
  getSpeedDisplayName,
  getVerticalAngleDisplayName,
  SPEED_PROGRESS,
} from "@/lib/shot-display";
import type { ShotWithDetails } from "@/lib/types";
import type { DirectionSlug } from "@/lib/taxonomy";

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

const linearDirectionMap: Record<DirectionSlug, { rotate: number; x: number; y: number }> = {
  left: { rotate: 180, x: -12, y: 0 },
  right: { rotate: 0, x: 12, y: 0 },
  up: { rotate: -90, x: 0, y: -12 },
  down: { rotate: 90, x: 0, y: 12 },
  in: { rotate: 0, x: 10, y: 0 },
  out: { rotate: 180, x: -10, y: 0 },
  clockwise: { rotate: 0, x: 0, y: 0 },
  counter_clockwise: { rotate: 0, x: 0, y: 0 },
  forward: { rotate: -24, x: 8, y: -8 },
  backward: { rotate: 156, x: -8, y: 8 },
  lateral_left: { rotate: 180, x: -12, y: 0 },
  lateral_right: { rotate: 0, x: 12, y: 0 },
  diagonal: { rotate: -40, x: 10, y: -10 },
  circular: { rotate: 0, x: 0, y: 0 },
  none: { rotate: 0, x: 0, y: 0 },
};

function DirectionVector({ direction }: { direction: DirectionSlug }) {
  if (direction === "clockwise" || direction === "circular") {
    return (
      <svg
        viewBox="0 0 240 240"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="120"
          cy="120"
          r="70"
          stroke="currentColor"
          strokeWidth="14"
          strokeOpacity="0.16"
        />
        <path
          d="M194 116c0-38-28-68-66-72"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M150 30l-24 12 18 18"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (direction === "counter_clockwise") {
    return (
      <svg
        viewBox="0 0 240 240"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="120"
          cy="120"
          r="70"
          stroke="currentColor"
          strokeWidth="14"
          strokeOpacity="0.16"
        />
        <path
          d="M46 124c0 38 28 68 66 72"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M90 210l24-12-18-18"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (direction === "none") {
    return (
      <svg
        viewBox="0 0 240 240"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="120"
          cy="120"
          r="64"
          stroke="currentColor"
          strokeWidth="18"
          strokeOpacity="0.2"
        />
        <circle cx="120" cy="120" r="16" fill="currentColor" fillOpacity="0.92" />
      </svg>
    );
  }

  if (direction === "in" || direction === "forward") {
    return (
      <svg
        viewBox="0 0 240 240"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="32"
          y="32"
          width="176"
          height="176"
          rx="16"
          stroke="currentColor"
          strokeWidth="12"
          strokeOpacity="0.16"
        />
        <rect
          x="70"
          y="70"
          width="100"
          height="100"
          rx="12"
          stroke="currentColor"
          strokeWidth="12"
          strokeOpacity="0.24"
        />
        <path
          d="M120 176v-78"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M92 124l28-28 28 28"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (direction === "out" || direction === "backward") {
    return (
      <svg
        viewBox="0 0 240 240"
        className="h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="32"
          y="32"
          width="176"
          height="176"
          rx="16"
          stroke="currentColor"
          strokeWidth="12"
          strokeOpacity="0.16"
        />
        <rect
          x="70"
          y="70"
          width="100"
          height="100"
          rx="12"
          stroke="currentColor"
          strokeWidth="12"
          strokeOpacity="0.24"
        />
        <path
          d="M120 64v78"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M92 116l28 28 28-28"
          stroke="currentColor"
          strokeWidth="18"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const { rotate } = linearDirectionMap[direction];

  return (
    <svg
      viewBox="0 0 240 240"
      className="h-full w-full"
      fill="none"
      aria-hidden="true"
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path
        d="M32 120h120"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M124 76l44 44-44 44"
        stroke="currentColor"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 78h56"
        stroke="currentColor"
        strokeWidth="10"
        strokeOpacity="0.18"
        strokeLinecap="round"
      />
      <path
        d="M32 162h84"
        stroke="currentColor"
        strokeWidth="10"
        strokeOpacity="0.12"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MetadataOverlay({ shot }: MetadataOverlayProps) {
  const { film, metadata, duration } = shot;
  const motionProgress = SPEED_PROGRESS[metadata.speed] * 100;
  const directionMotion = linearDirectionMap[metadata.direction];

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
            SceneDeck analysis overlay
          </div>
        </div>
      </motion.div>

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
          <span className="font-mono text-sm text-[var(--color-text-primary)]">
            {metadata.direction === "left" && "←"}
            {metadata.direction === "right" && "→"}
            {metadata.direction === "up" && "↑"}
            {metadata.direction === "down" && "↓"}
            {metadata.direction === "in" && "◎"}
            {metadata.direction === "out" && "◌"}
            {metadata.direction === "forward" && "↗"}
            {metadata.direction === "backward" && "↙"}
            {metadata.direction === "lateral_left" && "⇠"}
            {metadata.direction === "lateral_right" && "⇢"}
            {metadata.direction === "clockwise" && "↻"}
            {metadata.direction === "counter_clockwise" && "↺"}
            {metadata.direction === "diagonal" && "↗"}
            {metadata.direction === "circular" && "⟳"}
            {metadata.direction === "none" && "•"}
          </span>
          <div>
            <p
              className="text-xs uppercase tracking-[var(--letter-spacing-wide)]"
              style={{ color: "color-mix(in oklch, var(--color-text-primary) 70%, transparent)" }}
            >
              Movement
            </p>
            <p
              className="text-sm font-semibold text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {getMovementDisplayName(metadata.movementType)}
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
          Vector: {getDirectionDisplayName(metadata.direction)}
        </div>

        {metadata.isCompound && metadata.compoundParts ? (
          <div className="flex items-center gap-2">
            <span
              className="h-px w-6"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-overlay-trajectory) 50%, transparent)",
              }}
            />
            <div
              className="rounded-full border px-3 py-2"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-overlay-trajectory) 28%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-overlay-trajectory) 82%, transparent)",
              }}
            >
              <p
                className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)]"
                style={{ color: "color-mix(in oklch, var(--color-text-primary) 70%, transparent)" }}
              >
                Compound
              </p>
              <p className="font-mono text-xs text-[var(--color-text-primary)]">
                {getCompoundNotation(metadata.compoundParts)}
              </p>
            </div>
          </div>
        ) : null}
      </motion.div>

      <motion.div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          opacity: [0.16, 0.34, 0.2],
          scale: [1, 1.04, 1],
          x: [0, directionMotion.x, 0],
          y: [0, directionMotion.y, 0],
        }}
        transition={{
          duration: 3.6,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      >
        <div
          className="h-52 w-52 text-[var(--color-overlay-arrow)] sm:h-64 sm:w-64"
          style={{
            filter:
              "drop-shadow(0 0 40px color-mix(in oklch, var(--color-overlay-arrow) 48%, transparent))",
          }}
        >
          <DirectionVector direction={metadata.direction} />
        </div>
      </motion.div>

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
              Speed class
            </p>
            <p className="font-mono text-xs text-[var(--color-overlay-speed)]">
              {getSpeedDisplayName(metadata.speed)}
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-tertiary)]">
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${motionProgress}%` }}
              transition={{ duration: 0.8, delay: 0.35, ease: "easeOut" }}
              style={{
                background:
                  "linear-gradient(90deg, color-mix(in oklch, var(--color-overlay-speed) 40%, transparent), color-mix(in oklch, var(--color-overlay-speed) 92%, transparent))",
                boxShadow: "var(--shadow-glow)",
              }}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
            {getDurationCategoryDisplayName(metadata.durationCategory)}
          </p>
        </div>
      </motion.div>

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
