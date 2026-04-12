"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";
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
}: BoundaryHitlToolsProps) {
  const router = useRouter();
  const [splitAt, setSplitAt] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = startTc != null && endTc != null && endTc - startTc > MIN_SPLIT_MARGIN * 2;
  const shotDuration = startTc != null && endTc != null ? endTc - startTc : 0;
  const mediaAnchor = clipMediaAnchorStartTc ?? startTc;
  const usePlayhead = Boolean(hasVideoClip && videoRef && mediaAnchor != null);

  // Poll `currentTime`: `timeupdate` is sparse while playing and `seeking` often fires before the
  // element’s `currentTime` matches the scrub handle, so the split field goes stale without polling.
  // UI shows seconds **into this shot** (matches native player 0…duration when the file is a per-shot clip).
  useEffect(() => {
    if (!usePlayhead || !videoRef || mediaAnchor == null || startTc == null) {
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
      setSplitAt((prev) => (prev === next ? prev : next));
    };

    const intervalId = window.setInterval(syncFromVideo, 60);
    syncFromVideo();

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [usePlayhead, videoRef, mediaAnchor, startTc, shotId, videoUrlKey]);

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

  const doSplit = useCallback(async () => {
    const t = readSplitSec();
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
  }, [readSplitSec, startTc, endTc, shotDuration, shotId, router]);

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
      void doSplit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doSplit, canEdit]);

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
              onChange={(e) => setSplitAt(e.target.value)}
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
            Shortcut: S
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
