"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Merge, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";

const MIN_SPLIT_MARGIN = 0.25;

type BoundaryHitlToolsProps = {
  shotId: string;
  startTc: number | null;
  endTc: number | null;
  /** Film time at `video.currentTime === 0` (see `ShotWithDetails.clipMediaAnchorStartTc`). */
  clipMediaAnchorStartTc: number | null;
  nextShotId: string | null;
  videoRef?: RefObject<HTMLVideoElement | null>;
  hasVideoClip?: boolean;
  /** Bumps sync when the clip URL changes (remount). */
  videoUrlKey?: string | null;
  splitAt: string;
  onSplitAtChange: (value: string) => void;
  /** When true, `ShotVideoTransport` keeps `splitAt` in sync; otherwise poll the video (native controls path). */
  playheadSyncedByTransport: boolean;
  /** From timeline rail hover (custom transport only); used with Space+S to split at the previewed frame. */
  timelineHoverIntoShotSec?: number | null;
};

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  return target.isContentEditable;
}

export function BoundaryHitlTools({
  shotId,
  startTc,
  endTc,
  clipMediaAnchorStartTc,
  nextShotId,
  videoRef,
  hasVideoClip = false,
  videoUrlKey = null,
  splitAt,
  onSplitAtChange,
  playheadSyncedByTransport,
  timelineHoverIntoShotSec = null,
}: BoundaryHitlToolsProps) {
  const router = useRouter();
  const spaceDownRef = useRef(false);
  const [splitting, setSplitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = startTc != null && endTc != null && endTc - startTc > MIN_SPLIT_MARGIN * 2;
  const shotDuration = startTc != null && endTc != null ? endTc - startTc : 0;
  const mediaAnchor = clipMediaAnchorStartTc ?? startTc;
  const usePlayhead = Boolean(hasVideoClip && videoRef && mediaAnchor != null);

  // When there is no custom transport, native controls still need the split field to follow the playhead.
  useEffect(() => {
    if (
      playheadSyncedByTransport ||
      !usePlayhead ||
      !videoRef ||
      mediaAnchor == null ||
      startTc == null
    ) {
      return;
    }

    let alive = true;
    const syncFromVideo = () => {
      const video = videoRef.current;
      if (!alive || !video) {
        return;
      }
      const filmSec = mediaAnchor + video.currentTime;
      const intoShot = filmSec - startTc;
      const next = intoShot.toFixed(3);
      onSplitAtChange(next);
    };

    const intervalId = window.setInterval(syncFromVideo, 80);
    syncFromVideo();

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [
    playheadSyncedByTransport,
    usePlayhead,
    videoRef,
    mediaAnchor,
    startTc,
    shotId,
    videoUrlKey,
    onSplitAtChange,
  ]);

  const readSplitSec = useCallback((): number | null => {
    if (usePlayhead && videoRef?.current && mediaAnchor != null && startTc != null) {
      return mediaAnchor + videoRef.current.currentTime;
    }
    const intoShot = Number(splitAt);
    if (!Number.isFinite(intoShot) || startTc == null) {
      return null;
    }
    return startTc + intoShot;
  }, [usePlayhead, videoRef, mediaAnchor, startTc, splitAt]);

  const splitAtFilmSec = useCallback(
    async (t: number | null) => {
      if (t == null || !Number.isFinite(t)) {
        setMessage(
          "Enter seconds into this shot (0 = shot start), or scrub the player when video is on the page.",
        );
        return;
      }
      if (startTc == null || endTc == null) {
        setMessage("Shot is missing start or end timecodes.");
        return;
      }
      if (t <= startTc + MIN_SPLIT_MARGIN || t >= endTc - MIN_SPLIT_MARGIN) {
        setMessage(
          `Split must fall between ${MIN_SPLIT_MARGIN.toFixed(2)}s and ${(shotDuration - MIN_SPLIT_MARGIN).toFixed(2)}s into this shot (player timeline).`,
        );
        return;
      }
      setSplitting(true);
      setMessage(null);
      try {
        const res = await fetch(`/api/shots/${shotId}/split`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ splitAtSec: t }),
        });
        const data = (await res.json()) as { error?: string; tailShotId?: string };
        if (!res.ok) {
          setMessage(data.error ?? "Split failed.");
          return;
        }
        setMessage(`Split OK — tail shot ${data.tailShotId?.slice(0, 8)}…`);
        router.refresh();
      } catch {
        setMessage("Split request failed.");
      } finally {
        setSplitting(false);
      }
    },
    [startTc, endTc, shotDuration, shotId, router],
  );

  const doSplit = useCallback(() => {
    void splitAtFilmSec(readSplitSec());
  }, [splitAtFilmSec, readSplitSec]);

  useEffect(() => {
    const onSpaceDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = true;
      }
    };
    const onSpaceUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
      }
    };
    const onBlur = () => {
      spaceDownRef.current = false;
    };
    window.addEventListener("keydown", onSpaceDown);
    window.addEventListener("keyup", onSpaceUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onSpaceDown);
      window.removeEventListener("keyup", onSpaceUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "s" && e.key !== "S") {
        return;
      }
      if (!canEdit) {
        return;
      }
      if (isEditableTarget(e.target)) {
        return;
      }
      e.preventDefault();
      const useHoverSplit =
        spaceDownRef.current &&
        timelineHoverIntoShotSec != null &&
        startTc != null &&
        timelineHoverIntoShotSec > MIN_SPLIT_MARGIN &&
        timelineHoverIntoShotSec < shotDuration - MIN_SPLIT_MARGIN;
      const t = useHoverSplit ? startTc + timelineHoverIntoShotSec : readSplitSec();
      void splitAtFilmSec(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, splitAtFilmSec, readSplitSec, timelineHoverIntoShotSec, startTc, shotDuration]);

  async function doMerge() {
    if (!nextShotId) {
      setMessage("No adjacent next shot found.");
      return;
    }
    setMerging(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/shots/${shotId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeWithShotId: nextShotId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Merge failed.");
        return;
      }
      setMessage("Merged with next shot.");
      router.refresh();
    } catch {
      setMessage("Merge request failed.");
    } finally {
      setMerging(false);
    }
  }

  if (!canEdit && !nextShotId) {
    return null;
  }

  return (
    <section
      className="rounded-[var(--radius-xl)] border p-6"
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        Boundary HITL
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
        Split or merge without re-ingesting. Clears text embeddings, image embeddings, and detected objects on affected
        segments so you can re-run those jobs after boundaries settle.
      </p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
        Splitting updates timeline fields only: both segments keep the same on-disk clip URL until you re-export two
        files from the master (ingest / pipeline). The player constrains playback to each segment’s film-time window so
        lengths match the database.
      </p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
        After a split, this shot row stays as the head segment (same ID) and a new row is inserted for the tail. There
        are no stored “shot 1 / shot 2” counters; browse and film views sort by film timeline (
        <code className="font-mono text-xs">start_tc</code>), so the extra segment simply appears between neighbors.
        Embeddings and objects on the head are cleared; both head and tail metadata are marked needs_review.
      </p>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex min-w-[12rem] flex-col gap-1">
            <label
              htmlFor={`split-at-${shotId}`}
              className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
            >
              Split at (seconds into this shot)
            </label>
            <input
              id={`split-at-${shotId}`}
              type="text"
              inputMode="decimal"
              readOnly={usePlayhead}
              title={
                usePlayhead
                  ? "Matches the player: 0s at the start of this shot, up to the shot length. Pause or scrub to set."
                  : undefined
              }
              placeholder={
                endTc != null && startTc != null
                  ? `${MIN_SPLIT_MARGIN.toFixed(2)} – ${(shotDuration - MIN_SPLIT_MARGIN).toFixed(2)}`
                  : "…"
              }
              value={splitAt}
              onChange={(e) => onSplitAtChange(e.target.value)}
              className="h-8 w-full max-w-[14rem] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 font-mono text-sm text-[var(--color-text-primary)] read-only:cursor-default read-only:opacity-90"
            />
            {usePlayhead ? (
              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                Same scale as the player scrubber when the file is a per-shot clip. API still stores film time.
              </span>
            ) : (
              <span className="text-[11px] text-[var(--color-text-tertiary)]">
                No clip on this page — enter seconds from the start of this shot (0 = shot head).
              </span>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={splitting}
            onClick={() => void doSplit()}
          >
            {splitting ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
            Split
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Shortcuts: S (playhead) · Space+S (split at timeline hover)
          </span>
        </div>
      ) : null}

      {nextShotId ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={merging}
            onClick={() => void doMerge()}
          >
            {merging ? <Loader2 className="size-4 animate-spin" /> : <Merge className="size-4" />}
            Merge with next shot
          </Button>
          <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            Next: {nextShotId.slice(0, 8)}…
          </span>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 font-mono text-xs text-[var(--color-text-secondary)]">{message}</p>
      ) : null}
    </section>
  );
}
