"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clipPeerSegmentColor } from "@/lib/clip-timeline-colors";
import { formatMediaClock } from "@/lib/shot-display";

type SegmentWindow = { offset: number; end: number };

const PREVIEW_CANVAS_W = 176;
const PREVIEW_CANVAS_H = 99;

type ShotVideoTransportProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Film time at `video.currentTime === 0`. */
  mediaAnchor: number;
  startTc: number;
  endTc: number;
  segment: SegmentWindow;
  /** Bump when clip URL changes. */
  shotKey: string;
  currentShotId: string;
  /** Same-film rows sharing this `videoUrl` (for multi-segment rail after splits). */
  clipTimelinePeers: { id: string; startTc: number; endTc: number }[];
  /** Same URL as main clip — dedicated element seeks for hover preview without moving playhead. */
  previewSrc: string;
  previewPoster?: string | null;
  splitAt?: string;
  onSplitAtChange?: (value: string) => void;
  /** Seconds into this shot under the pointer while hovering the rail (null when not over rail). */
  onHoverIntoShotChange?: (intoSec: number | null) => void;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function ShotVideoTransport({
  videoRef,
  mediaAnchor,
  startTc,
  endTc,
  segment,
  shotKey,
  currentShotId,
  clipTimelinePeers,
  previewSrc,
  previewPoster,
  splitAt,
  onSplitAtChange,
  onHoverIntoShotChange,
}: ShotVideoTransportProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewGenRef = useRef(0);
  const hoverFileTRef = useRef<number | null>(null);
  const hoverRafRef = useRef<number | null>(null);

  const [intoShot, setIntoShot] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [hover, setHover] = useState<{ x: number; into: number } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const dragRef = useRef(false);

  const shotDuration = endTc - startTc;

  const timelineEnd = useMemo(() => {
    if (clipTimelinePeers.length > 1) {
      return Math.max(...clipTimelinePeers.map((p) => p.endTc));
    }
    return endTc;
  }, [clipTimelinePeers, endTc]);

  const timelineSpan = timelineEnd - mediaAnchor;
  const multiClip = clipTimelinePeers.length > 1 && timelineSpan > 0.001;

  useEffect(() => {
    setPreviewError(false);
    previewGenRef.current += 1;
  }, [shotKey]);

  const fileTimeFromIntoShot = useCallback(
    (into: number) => startTc + into - mediaAnchor,
    [startTc, mediaAnchor],
  );

  const intoShotFromClientX = useCallback(
    (clientX: number) => {
      const el = railRef.current;
      if (!el || shotDuration <= 0 || timelineSpan <= 0) {
        return null;
      }
      const rect = el.getBoundingClientRect();
      const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
      const filmT = mediaAnchor + frac * timelineSpan;
      const into = filmT - startTc;
      return clamp(into, 0, shotDuration);
    },
    [shotDuration, timelineSpan, mediaAnchor, startTc],
  );

  const drawPreviewFrame = useCallback((gen: number) => {
    const v = previewVideoRef.current;
    const c = canvasRef.current;
    if (!v || !c || gen !== previewGenRef.current) {
      return;
    }
    if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) {
      return;
    }
    const ctx = c.getContext("2d");
    if (!ctx) {
      return;
    }
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const cw = c.width;
    const ch = c.height;
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    try {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(v, 0, 0, vw, vh, dx, dy, dw, dh);
    } catch {
      setPreviewError(true);
    }
  }, []);

  const requestPreviewForFileTime = useCallback(
    (fileT: number) => {
      const v = previewVideoRef.current;
      if (!v || previewError || !previewSrc) {
        return;
      }
      const t = clamp(fileT, segment.offset, segment.end);
      const gen = ++previewGenRef.current;
      const done = () => {
        if (gen !== previewGenRef.current) {
          return;
        }
        drawPreviewFrame(gen);
      };
      if (Math.abs(v.currentTime - t) < 1 / 120) {
        done();
        return;
      }
      const onSeeked = () => {
        v.removeEventListener("seeked", onSeeked);
        done();
      };
      v.addEventListener("seeked", onSeeked);
      v.currentTime = t;
    },
    [segment.offset, segment.end, previewError, previewSrc, drawPreviewFrame],
  );

  const scheduleHoverPreview = useCallback(
    (into: number) => {
      if (previewError || !previewSrc) {
        return;
      }
      const ft = fileTimeFromIntoShot(into);
      hoverFileTRef.current = ft;
      if (hoverRafRef.current != null) {
        return;
      }
      hoverRafRef.current = window.requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const target = hoverFileTRef.current;
        if (target != null) {
          requestPreviewForFileTime(target);
        }
      });
    },
    [fileTimeFromIntoShot, previewError, previewSrc, requestPreviewForFileTime],
  );

  const seekToIntoShot = useCallback(
    (into: number) => {
      const v = videoRef.current;
      if (!v) {
        return;
      }
      const ft = fileTimeFromIntoShot(into);
      const next = clamp(ft, segment.offset, segment.end);
      v.currentTime = next;
    },
    [videoRef, fileTimeFromIntoShot, segment],
  );

  const syncFromVideo = useCallback(() => {
    if (dragRef.current) {
      return;
    }
    const v = videoRef.current;
    if (!v || shotDuration <= 0) {
      return;
    }
    const film = mediaAnchor + v.currentTime;
    const into = film - startTc;
    const clampedInto = clamp(into, 0, shotDuration);
    setIntoShot(clampedInto);
    if (onSplitAtChange) {
      onSplitAtChange(clampedInto.toFixed(3));
    }
  }, [videoRef, mediaAnchor, startTc, shotDuration, onSplitAtChange]);

  const applyIntoShot = useCallback(
    (into: number) => {
      const clamped = clamp(into, 0, shotDuration);
      setIntoShot(clamped);
      onSplitAtChange?.(clamped.toFixed(3));
      seekToIntoShot(clamped);
    },
    [shotDuration, onSplitAtChange, seekToIntoShot],
  );

  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onVolume = () => setMuted(v.muted);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("volumechange", onVolume);
    setMuted(v.muted);
    setPlaying(!v.paused);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("volumechange", onVolume);
    };
  }, [videoRef, shotKey]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    const onMeta = () => syncFromVideo();
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("seeked", syncFromVideo);
    syncFromVideo();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("seeked", syncFromVideo);
    };
  }, [videoRef, shotKey, syncFromVideo]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!dragRef.current) {
        syncFromVideo();
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [syncFromVideo]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    if (v.paused) {
      void v.play();
    } else {
      v.pause();
    }
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) {
      return;
    }
    v.muted = !v.muted;
    setMuted(v.muted);
  }, [videoRef]);

  const onRailPointerDown = (e: { clientX: number; pointerId: number; target: EventTarget | null }) => {
    const into = intoShotFromClientX(e.clientX);
    if (into == null) {
      return;
    }
    dragRef.current = true;
    if (e.target instanceof HTMLElement) {
      e.target.setPointerCapture(e.pointerId);
    }
    onHoverIntoShotChange?.(into);
    applyIntoShot(into);
  };

  const onRailPointerMove = (e: { clientX: number }) => {
    if (!dragRef.current) {
      const into = intoShotFromClientX(e.clientX);
      if (into != null && railRef.current) {
        const rect = railRef.current.getBoundingClientRect();
        setHover({ x: e.clientX - rect.left, into });
        scheduleHoverPreview(into);
        onHoverIntoShotChange?.(into);
      } else {
        onHoverIntoShotChange?.(null);
      }
      return;
    }
    const into = intoShotFromClientX(e.clientX);
    if (into != null) {
      applyIntoShot(into);
    }
  };

  const onRailPointerUp = (e: { pointerId: number; target: EventTarget | null }) => {
    if (dragRef.current) {
      dragRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      syncFromVideo();
    }
  };

  const onRailLeave = () => {
    setHover(null);
    onHoverIntoShotChange?.(null);
    hoverFileTRef.current = null;
    previewGenRef.current += 1;
    if (hoverRafRef.current != null) {
      window.cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
  };

  const filmNow = startTc + intoShot;
  const playPct =
    timelineSpan > 0 ? clamp((filmNow - mediaAnchor) / timelineSpan, 0, 1) * 100 : 0;
  const splitParsed = splitAt != null && splitAt !== "" ? Number(splitAt) : NaN;
  const showSplitGhost =
    onSplitAtChange &&
    Number.isFinite(splitParsed) &&
    Math.abs(splitParsed - intoShot) > 0.08 &&
    splitParsed > 0 &&
    splitParsed < shotDuration;
  const splitFilmT = startTc + splitParsed;
  const splitPct =
    showSplitGhost && timelineSpan > 0
      ? clamp((splitFilmT - mediaAnchor) / timelineSpan, 0, 1) * 100
      : null;

  const filmAtPlayhead = startTc + intoShot;
  const fileTc = fileTimeFromIntoShot(intoShot);
  const hoverFilm = hover != null ? startTc + hover.into : null;

  return (
    <div
      className="rounded-b-[calc(var(--radius-xl)_+_6px)] border-t px-3 py-3"
      style={{
        backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 88%, transparent)",
        borderColor: "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <video
        ref={previewVideoRef}
        src={previewSrc || undefined}
        poster={previewPoster ?? undefined}
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
        className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px opacity-0"
        aria-hidden
        onError={() => setPreviewError(true)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0 rounded-full text-[var(--color-text-primary)]"
            aria-label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
          >
            {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0 rounded-full text-[var(--color-text-primary)]"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            <span>
              Shot timeline · hover = seeked-frame preview
              {multiClip ? ` · ${clipTimelinePeers.length} segments on this clip` : ""}
            </span>
            <span className="tabular-nums normal-case tracking-normal text-[var(--color-text-secondary)]">
              Film {formatMediaClock(filmAtPlayhead)} · in file {formatMediaClock(fileTc)}
            </span>
          </div>

          <div
            ref={railRef}
            className="relative h-9 cursor-pointer rounded-md px-0 py-2"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={Math.round(shotDuration * 1000) / 1000}
            aria-valuenow={Math.round(intoShot * 1000) / 1000}
            aria-label="Playhead in this shot"
            onPointerDown={onRailPointerDown}
            onPointerMove={onRailPointerMove}
            onPointerUp={onRailPointerUp}
            onPointerCancel={onRailPointerUp}
            onPointerLeave={onRailLeave}
          >
            <div
              className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full"
              style={{
                backgroundColor: "color-mix(in oklch, var(--color-border-default) 55%, var(--color-surface-primary))",
              }}
            />
            {multiClip ? (
              <div
                className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full"
                aria-hidden
              >
                {clipTimelinePeers.map((p, i) => {
                  const left = ((p.startTc - mediaAnchor) / timelineSpan) * 100;
                  const w = ((p.endTc - p.startTc) / timelineSpan) * 100;
                  const isHere = p.id === currentShotId;
                  return (
                    <div
                      key={p.id}
                      className="absolute top-0 h-full rounded-sm"
                      title={
                        isHere
                          ? "This shot (you are here)"
                          : `Adjacent segment ${p.id.slice(0, 8)}…`
                      }
                      style={{
                        left: `${left}%`,
                        width: `${w}%`,
                        backgroundColor: clipPeerSegmentColor(i),
                        opacity: isHere ? 0.92 : 0.5,
                        boxShadow: isHere
                          ? "inset 0 0 0 2px color-mix(in oklch, white 70%, transparent)"
                          : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ) : null}
            <div
              className="pointer-events-none absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full"
              style={{
                width: `${playPct}%`,
                backgroundColor: "color-mix(in oklch, var(--color-accent-light) 75%, var(--color-surface-primary))",
              }}
            />
            {splitPct != null ? (
              <div
                className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/90"
                style={{ left: `${splitPct}%` }}
                title="Split-at (typed) differs from playhead"
              />
            ) : null}
            <div
              className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-surface-primary)] shadow-md"
              style={{
                left: `${playPct}%`,
                backgroundColor: "var(--color-accent-light)",
              }}
            />
            {hover != null && hoverFilm != null ? (
              <div
                className="pointer-events-none absolute bottom-full z-10 mb-1 flex flex-col items-center gap-1 rounded-md border border-[var(--color-border-default)] px-2 py-1.5 font-mono text-[10px] text-[var(--color-text-primary)] shadow-lg"
                style={{
                  left: clamp(hover.x, 72, (railRef.current?.clientWidth ?? 200) - 72),
                  transform: "translateX(-50%)",
                  backgroundColor: "color-mix(in oklch, var(--color-surface-primary) 94%, transparent)",
                }}
              >
                {!previewError ? (
                  <canvas
                    ref={canvasRef}
                    width={PREVIEW_CANVAS_W}
                    height={PREVIEW_CANVAS_H}
                    className="block rounded-sm border border-[var(--color-border-subtle)] bg-black"
                  />
                ) : null}
                <span className="whitespace-nowrap">
                  +{formatMediaClock(hover.into)} in shot · film {formatMediaClock(hoverFilm)}
                  {previewError ? " · preview off (CORS or decode)" : ""}
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-[var(--color-text-secondary)]">
            <span>{formatMediaClock(intoShot)}</span>
            <span>{formatMediaClock(shotDuration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
