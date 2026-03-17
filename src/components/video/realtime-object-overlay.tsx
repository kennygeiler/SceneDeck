"use client";

import type { CSSProperties } from "react";

import { getTrackColor } from "@/components/video/object-overlay";
import type { RealtimeDetection } from "@/hooks/use-realtime-detection";

type RealtimeObjectOverlayProps = {
  detections: RealtimeDetection[];
  videoWidth: number;
  videoHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  visible: boolean;
};

type OverlayBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const CORNER_SIZE = 14;

function toOverlayBox(
  bbox: [number, number, number, number],
  videoWidth: number,
  videoHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): OverlayBox | null {
  if (videoWidth <= 0 || videoHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const [x, y, width, height] = bbox;
  const scale = Math.max(videoWidth / sourceWidth, videoHeight / sourceHeight);
  const scaledWidth = sourceWidth * scale;
  const scaledHeight = sourceHeight * scale;
  const offsetX = (videoWidth - scaledWidth) / 2;
  const offsetY = (videoHeight - scaledHeight) / 2;

  return {
    left: offsetX + x * scale,
    top: offsetY + y * scale,
    width: width * scale,
    height: height * scale,
  };
}

function formatLiveLabel(detection: RealtimeDetection) {
  return `${detection.className.replace(/_/gu, " ").toUpperCase()}  ${Math.round(
    detection.score * 100,
  )}%`;
}

export function RealtimeObjectOverlay({
  detections,
  videoWidth,
  videoHeight,
  sourceWidth,
  sourceHeight,
  visible,
}: RealtimeObjectOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      <div
        className="absolute left-4 top-4 flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--color-text-primary)]"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-primary) 78%, transparent)",
          borderColor: "color-mix(in oklch, var(--color-overlay-live) 40%, transparent)",
          boxShadow:
            "0 0 0 1px color-mix(in oklch, var(--color-overlay-live) 18%, transparent), var(--shadow-md)",
        }}
      >
        <span
          aria-hidden="true"
          className="h-2.5 w-2.5 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--color-overlay-live)" }}
        />
        LIVE
      </div>

      {detections.map((detection, index) => {
        const box = toOverlayBox(
          detection.bbox,
          videoWidth,
          videoHeight,
          sourceWidth,
          sourceHeight,
        );

        if (!box) {
          return null;
        }

        const trackColor = getTrackColor(detection.className.toLowerCase().replace(/\s+/gu, "_"));
        const style = {
          width: `${box.width}px`,
          height: `${box.height}px`,
          transform: `translate(${box.left}px, ${box.top}px)`,
          ["--track-color" as string]: trackColor,
        } satisfies CSSProperties;

        return (
          <div
            key={`${detection.className}-${index}`}
            className="absolute left-0 top-0 will-change-transform"
            style={{
              ...style,
              transition:
                "transform 200ms ease-out, width 200ms ease-out, height 200ms ease-out, opacity 120ms linear",
            }}
          >
            <div
              className="absolute left-0 top-0 bg-[color:var(--track-color)] px-[6px] py-[3px] font-mono text-[9px] uppercase tracking-[0.16em] text-white"
              style={{
                whiteSpace: "pre",
                transform: "translateY(calc(-100% - 2px))",
              }}
            >
              {formatLiveLabel(detection)}
            </div>

            <div
              className="absolute left-0 top-0 h-full w-full"
              style={{
                boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--track-color) 18%, transparent)",
              }}
            />

            <div
              className="absolute left-0 top-0 border-l-[2px] border-t-[2px] border-[color:var(--track-color)]"
              style={{ width: CORNER_SIZE, height: CORNER_SIZE }}
            />
            <div
              className="absolute right-0 top-0 border-r-[2px] border-t-[2px] border-[color:var(--track-color)]"
              style={{ width: CORNER_SIZE, height: CORNER_SIZE }}
            />
            <div
              className="absolute bottom-0 left-0 border-b-[2px] border-l-[2px] border-[color:var(--track-color)]"
              style={{ width: CORNER_SIZE, height: CORNER_SIZE }}
            />
            <div
              className="absolute bottom-0 right-0 border-b-[2px] border-r-[2px] border-[color:var(--track-color)]"
              style={{ width: CORNER_SIZE, height: CORNER_SIZE }}
            />
          </div>
        );
      })}
    </div>
  );
}
