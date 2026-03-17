"use client";

import type { CSSProperties } from "react";

import type { ShotObjectKeyframe, ShotSceneContext } from "@/db/schema";

type ObjectOverlayProps = {
  tracks: Array<{
    id: string;
    trackId: string;
    label: string;
    category: string | null;
    confidence: number | null;
    yoloClass: string | null;
    yoloConfidence: number | null;
    cinematicLabel: string | null;
    description: string | null;
    significance: string | null;
    keyframes: Array<{ t: number; x: number; y: number; w: number; h: number }>;
    startTime: number;
    endTime: number;
    attributes: Record<string, string> | null;
    sceneContext: ShotSceneContext | null;
  }>;
  currentTime: number;
  visible: boolean;
};

type InterpolatedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const ENTRY_BUFFER_SECONDS = 0.15;
const EXIT_BUFFER_SECONDS = 0.1;
const MAX_VISIBLE_TRACKS = 12;
const CORNER_SIZE = 14;

const VEHICLE_CLASSES = new Set([
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
]);

const ANIMAL_CLASSES = new Set([
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
]);

const FURNITURE_CLASSES = new Set([
  "chair",
  "couch",
  "bed",
  "dining_table",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
]);

const FOOD_CLASSES = new Set([
  "bottle",
  "wine_glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot_dog",
  "pizza",
  "donut",
  "cake",
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function interpolateBbox(keyframes: ShotObjectKeyframe[], time: number): InterpolatedBox | null {
  if (keyframes.length === 0) {
    return null;
  }

  const before = [...keyframes].reverse().find((keyframe) => keyframe.t <= time);
  const after = keyframes.find((keyframe) => keyframe.t > time);

  if (!before && !after) {
    return null;
  }

  if (!before) {
    return after ? { x: after.x, y: after.y, w: after.w, h: after.h } : null;
  }

  if (!after) {
    return { x: before.x, y: before.y, w: before.w, h: before.h };
  }

  const progress = (time - before.t) / (after.t - before.t);

  return {
    x: before.x + (after.x - before.x) * progress,
    y: before.y + (after.y - before.y) * progress,
    w: before.w + (after.w - before.w) * progress,
    h: before.h + (after.h - before.h) * progress,
  };
}

export function getTrackColor(yoloClass: string | null) {
  if (yoloClass === "person") {
    return "var(--color-overlay-object-person)";
  }

  if (yoloClass && VEHICLE_CLASSES.has(yoloClass)) {
    return "var(--color-overlay-object-vehicle)";
  }

  if (yoloClass && ANIMAL_CLASSES.has(yoloClass)) {
    return "var(--color-overlay-object-animal)";
  }

  if (yoloClass && FURNITURE_CLASSES.has(yoloClass)) {
    return "var(--color-overlay-object-furniture)";
  }

  if (yoloClass && FOOD_CLASSES.has(yoloClass)) {
    return "var(--color-overlay-object-food)";
  }

  return "var(--color-overlay-object-default)";
}

function formatLabel(
  cinematicLabel: string | null,
  yoloClass: string | null,
  fallbackLabel: string,
  confidence: number | null,
) {
  const percentage =
    typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "--%";
  const label = (cinematicLabel || yoloClass || fallbackLabel).replace(/_/gu, " ");

  return `${label.toUpperCase()}  ${percentage}`;
}

function formatSceneValue(value: string | undefined) {
  return value ? value.replace(/_/gu, " ") : "Unknown";
}

export function ObjectOverlay({
  tracks,
  currentTime,
  visible,
}: ObjectOverlayProps) {
  if (!visible || tracks.length === 0) {
    return null;
  }

  const sceneContext = tracks.find((track) => track.sceneContext)?.sceneContext ?? null;

  const activeTracks = tracks
    .filter(
      (track) =>
        track.keyframes.length > 0 &&
        currentTime >= track.startTime - ENTRY_BUFFER_SECONDS &&
        currentTime <= track.endTime + EXIT_BUFFER_SECONDS,
    )
    .map((track) => {
      const sampleTime = clamp(currentTime, track.startTime, track.endTime);
      const bbox = interpolateBbox(track.keyframes, sampleTime);

      if (!bbox) {
        return null;
      }

      return {
        ...track,
        bbox,
        color: getTrackColor(track.yoloClass),
        labelText: formatLabel(
          track.cinematicLabel,
          track.yoloClass,
          track.label,
          track.yoloConfidence ?? track.confidence,
        ),
        isVisible: currentTime >= track.startTime && currentTime <= track.endTime,
        confidenceRank: track.yoloConfidence ?? track.confidence ?? 0,
      };
    })
    .filter((track): track is NonNullable<typeof track> => track !== null)
    .sort((left, right) => right.confidenceRank - left.confidenceRank)
    .slice(0, MAX_VISIBLE_TRACKS);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {activeTracks.map((track) => {
        const wrapperStyle = {
          width: `${track.bbox.w * 100}%`,
          height: `${track.bbox.h * 100}%`,
          transform: `translate(${track.bbox.x * 100}%, ${track.bbox.y * 100}%)`,
          opacity: track.isVisible ? 1 : 0,
          transition: `transform 120ms linear, width 120ms linear, height 120ms linear, opacity ${
            track.isVisible ? 150 : 100
          }ms linear`,
          ["--track-color" as string]: track.color,
        } satisfies CSSProperties;

        return (
          <div
            key={track.id}
            className="absolute left-0 top-0 will-change-transform"
            style={wrapperStyle}
          >
            <div
              className="absolute left-0 top-0 bg-[color:var(--track-color)] px-[6px] py-[3px] font-mono text-[9px] uppercase tracking-[0.16em] text-white"
              style={{
                whiteSpace: "pre",
                transform: "translateY(calc(-100% - 2px))",
              }}
            >
              {track.labelText}
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

      {sceneContext ? (
        <div
          className="absolute bottom-4 left-4 z-30 max-w-[18rem] border px-3 py-2 font-mono text-[10px] tracking-[0.08em] text-[var(--color-text-primary)] backdrop-blur-md"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[8px] uppercase text-[var(--color-text-tertiary)]">Location</p>
              <p className="mt-1 leading-4">{formatSceneValue(sceneContext.location)}</p>
            </div>
            {sceneContext.interiorExterior ? (
              <span
                className="border px-2 py-1 text-[8px] uppercase text-[var(--color-text-primary)]"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-overlay-object-person) 18%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-overlay-object-person) 42%, transparent)",
                }}
              >
                {formatSceneValue(sceneContext.interiorExterior)}
              </span>
            ) : null}
          </div>

          <div className="mt-2 grid gap-2">
            <div>
              <p className="text-[8px] uppercase text-[var(--color-text-tertiary)]">Time</p>
              <p className="mt-1 leading-4">{formatSceneValue(sceneContext.timeOfDay)}</p>
            </div>
            <div>
              <p className="text-[8px] uppercase text-[var(--color-text-tertiary)]">Mood</p>
              <p className="mt-1 leading-4">{formatSceneValue(sceneContext.mood)}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
