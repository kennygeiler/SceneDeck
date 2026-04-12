"use client";

import Image from "next/image";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Scissors } from "lucide-react";

import { ShotCompositionPanel } from "@/components/video/metadata-overlay";
import { ShotVideoJs } from "@/components/video/shot-video-js";
import { ShotVideoTransport } from "@/components/video/shot-video-transport";
import { getShotPlaybackSegment } from "@/lib/shot-playback-segment";
import type { ShotWithDetails } from "@/lib/types";

export type ShotPlaybackFeedback = {
  spaceHeld: boolean;
  hoverSplitArmed: boolean;
  canKeyboardSplit: boolean;
  splitFlash: { id: number; mode: "hover" | "playhead" } | null;
  onSplitFlashDone?: () => void;
};

type ShotPlayerProps = {
  shot: ShotWithDetails;
  /** When set, attached to the underlying `<video>` for timeline sync (e.g. boundary HITL). */
  videoRef?: RefObject<HTMLVideoElement | null>;
  /** Controlled: seconds into shot (synced from custom transport when present). */
  splitAt?: string;
  onSplitAtChange?: (value: string) => void;
  onTimelineHoverIntoShotChange?: (intoSec: number | null) => void;
  playbackFeedback?: ShotPlaybackFeedback;
};

export function ShotPlayer({
  shot,
  videoRef,
  splitAt,
  onSplitAtChange,
  onTimelineHoverIntoShotChange,
  playbackFeedback,
}: ShotPlayerProps) {
  const [videoAttachTick, setVideoAttachTick] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const setVideoEl = useCallback(
    (node: HTMLVideoElement | null) => {
      localVideoRef.current = node;
      if (videoRef) {
        (videoRef as MutableRefObject<HTMLVideoElement | null>).current = node;
      }
      if (node) {
        setVideoAttachTick((t) => t + 1);
      }
    },
    [videoRef],
  );

  const playbackSegment = useMemo(() => getShotPlaybackSegment(shot), [shot]);
  const segment = useMemo(() => {
    if (!playbackSegment) {
      return null;
    }
    return { offset: playbackSegment.offset, end: playbackSegment.end };
  }, [playbackSegment]);
  const useCustomTransport = Boolean(playbackSegment && shot.videoUrl);

  useEffect(() => {
    const v = localVideoRef.current;
    if (!v || !segment) {
      return;
    }

    const { offset, end } = segment;

    const clamp = () => {
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : end;
      const hi = Math.min(end, dur + 0.001);
      if (v.currentTime < offset - 0.05) {
        v.currentTime = offset;
      }
      if (v.currentTime > hi) {
        v.pause();
        v.currentTime = Math.min(end, dur);
      }
    };

    const snapToSegmentStart = () => {
      v.currentTime = offset;
    };

    v.addEventListener("timeupdate", clamp);
    v.addEventListener("seeking", clamp);
    v.addEventListener("loadedmetadata", snapToSegmentStart);

    snapToSegmentStart();
    clamp();

    return () => {
      v.removeEventListener("timeupdate", clamp);
      v.removeEventListener("seeking", clamp);
      v.removeEventListener("loadedmetadata", snapToSegmentStart);
    };
  }, [shot.id, segment, videoAttachTick]);

  return (
    <div className="space-y-4">
      <div
        className="overflow-hidden rounded-[calc(var(--radius-xl)_+_6px)] border shadow-[var(--shadow-xl)]"
        style={{
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
        }}
      >
        <ShotCompositionPanel shot={shot} />
        <div
          className={
            useCustomTransport
              ? "relative aspect-video overflow-hidden"
              : "relative aspect-video overflow-hidden rounded-b-[calc(var(--radius-xl)_+_6px)]"
          }
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-secondary) 88%, transparent), color-mix(in oklch, var(--color-surface-primary) 92%, transparent))",
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

        {shot.videoUrl ? (
          <ShotVideoJs
            videoUrl={shot.videoUrl}
            posterUrl={shot.thumbnailUrl ?? undefined}
            controls={!useCustomTransport}
            shotKey={`${shot.id}:${shot.videoUrl}`}
            onVideoElement={setVideoEl}
          />
        ) : shot.thumbnailUrl ? (
          <Image
            aria-hidden="true"
            alt=""
            src={shot.thumbnailUrl}
            fill
            priority
            sizes="(min-width: 1024px) 960px, 100vw"
            className="absolute inset-0 object-cover"
          />
        ) : null}

        {!shot.videoUrl ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="max-w-xl"
            >
              <h2
                className="text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-3xl"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {shot.film.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)] sm:text-base">
                {shot.semantic?.description ?? "No video clip available. Run the pipeline to attach a media asset."}
              </p>
            </motion.div>
          </div>
        ) : null}

        {playbackFeedback ? (
          <ShotPlaybackFeedbackOverlays feedback={playbackFeedback} />
        ) : null}

        </div>

        {playbackSegment ? (
          <ShotVideoTransport
            videoRef={localVideoRef}
            mediaAnchor={playbackSegment.mediaAnchor}
            startTc={playbackSegment.startTc}
            endTc={playbackSegment.endTc}
            segment={{ offset: playbackSegment.offset, end: playbackSegment.end }}
            shotKey={`${shot.id}:${shot.videoUrl ?? ""}`}
            currentShotId={shot.id}
            clipTimelinePeers={shot.clipTimelinePeers ?? []}
            previewSrc={shot.videoUrl!}
            previewPoster={shot.thumbnailUrl ?? null}
            splitAt={splitAt}
            onSplitAtChange={onSplitAtChange}
            onHoverIntoShotChange={onTimelineHoverIntoShotChange}
          />
        ) : null}
      </div>
    </div>
  );
}

function ShotPlaybackFeedbackOverlays({ feedback }: { feedback: ShotPlaybackFeedback }) {
  const { spaceHeld, hoverSplitArmed, canKeyboardSplit, splitFlash, onSplitFlashDone } = feedback;

  return (
    <>
      {splitFlash ? (
        <span key={splitFlash.id} className="sr-only" aria-live="polite" aria-atomic>
          {`Clip split at ${splitFlash.mode === "hover" ? "timeline hover" : "playhead"}.`}
        </span>
      ) : null}

      <AnimatePresence>
        {spaceHeld ? (
          <motion.div
            key="space-held"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="pointer-events-none absolute left-1/2 top-3 z-[35] flex max-w-[calc(100%-1rem)] -translate-x-1/2 justify-center"
          >
            <div
              className="animate-pulse rounded-full border-2 px-4 py-2 shadow-lg ring-2 ring-amber-400/35"
              style={{
                borderColor: "color-mix(in oklch, var(--color-accent-light) 72%, white)",
                backgroundColor: "color-mix(in oklch, var(--color-surface-primary) 82%, black)",
                boxShadow:
                  "0 0 24px color-mix(in oklch, var(--color-accent-light) 25%, transparent), 0 8px 28px color-mix(in oklch, black 40%, transparent)",
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-accent-light)]">
                Space held
              </p>
              <p className="mt-0.5 max-w-[16rem] text-center text-xs leading-snug text-[var(--color-text-primary)]">
                {!canKeyboardSplit
                  ? "Keyboard split is not available for this shot length."
                  : hoverSplitArmed
                    ? "Press S — new cut at timeline hover"
                    : "Press S — new cut at playhead"}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {splitFlash ? (
          <motion.div
            key={splitFlash.id}
            role="status"
            className="pointer-events-none absolute inset-0 z-[40] flex items-center justify-center overflow-hidden rounded-[inherit]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
          >
            <motion.div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 42%, color-mix(in oklch, white 22%, transparent) 0%, transparent 62%)",
                mixBlendMode: "screen",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.9, 0.9, 0] }}
              transition={{
                duration: 1.35,
                times: [0, 0.1, 0.52, 1],
                ease: "easeOut",
              }}
            />
            <motion.div
              className="relative flex items-center gap-2.5 rounded-xl border px-5 py-3 shadow-2xl"
              style={{
                borderColor: "color-mix(in oklch, var(--color-accent-light) 55%, transparent)",
                backgroundColor: "color-mix(in oklch, black 78%, var(--color-surface-primary))",
                boxShadow: "0 0 0 1px color-mix(in oklch, white 12%, transparent)",
              }}
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{
                scale: [0.88, 1.05, 1, 1],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.45,
                times: [0, 0.08, 0.48, 1],
                ease: [0.22, 1, 0.36, 1],
              }}
              onAnimationComplete={() => onSplitFlashDone?.()}
            >
              <Scissors
                className="size-6 shrink-0 text-amber-300"
                strokeWidth={1.75}
                aria-hidden
              />
              <div className="text-left">
                <p
                  className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-amber-200/90"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Cut created
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-primary)]">
                  <Clapperboard className="size-4 text-[var(--color-text-tertiary)]" aria-hidden />
                  {splitFlash.mode === "hover" ? "At timeline hover" : "At playhead"}
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
