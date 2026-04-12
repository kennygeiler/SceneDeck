"use client";

import { useCallback, useEffect, useRef } from "react";

import videojs from "video.js";
import "video.js/dist/video-js.css";

type ShotVideoJsProps = {
  videoUrl: string;
  posterUrl?: string | null;
  controls: boolean;
  shotKey: string;
  className?: string;
  onVideoElement: (el: HTMLVideoElement | null) => void;
};

type VideoJsPlayer = ReturnType<typeof videojs>;

/**
 * Video.js-backed surface for shot clips. Exposes the HTML5 tech element for segment clamping and transport.
 * Uses a ref callback so dispose/remount matches React Strict Mode (ref null → new node).
 */
export function ShotVideoJs({
  videoUrl,
  posterUrl,
  controls,
  shotKey,
  className,
  onVideoElement,
}: ShotVideoJsProps) {
  const onVideoElementRef = useRef(onVideoElement);
  onVideoElementRef.current = onVideoElement;

  const disposeRef = useRef<(() => void) | null>(null);

  const attachVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      disposeRef.current?.();
      disposeRef.current = null;
      onVideoElementRef.current(null);

      if (!node) {
        return;
      }

      const player: VideoJsPlayer = videojs(node, {
        controls,
        muted: true,
        preload: "metadata",
        playsinline: true,
        /** Fill the `aspect-video` wrapper; avoids intrinsic 300×169-style layout on first paint. */
        fill: true,
        fluid: false,
        responsive: false,
        bigPlayButton: controls,
        controlBar: controls ? undefined : false,
        userActions: {
          hotkeys: false,
        },
      });

      if (posterUrl) {
        player.poster(posterUrl);
      }
      player.src({ src: videoUrl, type: "video/mp4" });

      const wireTech = () => {
        const tech = player.tech({ IWillNotUseThisInPlugins: true });
        const techEl = tech?.el?.();
        const vEl =
          techEl instanceof HTMLVideoElement ? techEl : node instanceof HTMLVideoElement ? node : null;
        if (!vEl) {
          return;
        }
        vEl.setAttribute("playsinline", "");
        vEl.playsInline = true;
        vEl.muted = true;
        try {
          vEl.crossOrigin = "anonymous";
        } catch {
          /* ignore */
        }
        onVideoElementRef.current(vEl);
      };

      player.ready(() => {
        player.fill(true);
        wireTech();
      });

      disposeRef.current = () => {
        onVideoElementRef.current(null);
        if (!player.isDisposed()) {
          player.dispose();
        }
      };
    },
    [videoUrl, posterUrl, controls],
  );

  useEffect(
    () => () => {
      disposeRef.current?.();
      disposeRef.current = null;
    },
    [],
  );

  return (
    <div data-vjs-player className={`mv-shot-vjs absolute inset-0 ${className ?? ""}`}>
      <video
        ref={attachVideoRef}
        key={shotKey}
        className="video-js vjs-big-play-centered h-full w-full"
        playsInline
        muted
        preload="metadata"
      />
    </div>
  );
}
