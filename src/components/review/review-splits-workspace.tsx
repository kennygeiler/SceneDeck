"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Check,
  CircleHelp,
  FileJson,
  Film,
  LoaderCircle,
  Pause,
  Play,
  ScissorsLineDashed,
  SkipBack,
  SkipForward,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SplitSource = "auto" | "detected" | "manual";

type ReviewSplit = {
  start: number;
  end: number;
  thumbnail_time: number;
  split_source?: SplitSource;
  confidence?: number | null;
};

type ReviewPayload = {
  source_video: string;
  filename: string;
  total_duration: number;
  fps: number;
  splits: ReviewSplit[];
};

type ShotSegment = {
  id: string;
  start: number;
  end: number;
  thumbnailTime: number;
  thumbnail: string | null;
  thumbnailDirty: boolean;
  splitSource: SplitSource;
  confidence: number | null;
};

type SegmentTagState = {
  status: "idle" | "loading" | "ready" | "error";
  tags: string[];
  analyzedThumbnail: string | null;
};

type ExportSummary = {
  shotCount: number;
  added: number;
  removed: number;
};

type DetectedCut = {
  time: number;
  confidence: number;
};

type TimelineSelectionStatus =
  | "dragging"
  | "detecting"
  | "success"
  | "empty"
  | "error";

type TimelineSelection = {
  id: string;
  startTime: number;
  endTime: number;
  status: TimelineSelectionStatus;
  message?: string;
};

type CutPreview = {
  id: string;
  time: number;
  confidence: number | null;
  source: SplitSource;
  beforeFrame: string;
  afterFrame: string;
};

type SplitInsertResult = {
  nextSegments: ShotSegment[];
  insertedBoundaryId: string | null;
};

type SplitBoundary = {
  id: string;
  label: number;
  time: number;
  source: SplitSource;
  confidence: number | null;
};

const SPLIT_EPSILON = 0.15;
const SEEK_STEP = 1;
const SEEK_BIG_STEP = 5;
const DEFAULT_FPS = 24;
const TIMELINE_CLICK_MOVE_THRESHOLD = 5;
const TIMELINE_SEGMENT_BACKGROUNDS = [
  "linear-gradient(135deg, color-mix(in oklch, var(--color-accent-base) 24%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 92%, transparent))",
  "linear-gradient(135deg, color-mix(in oklch, var(--color-signal-violet) 22%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 88%, transparent))",
  "linear-gradient(135deg, color-mix(in oklch, var(--color-overlay-badge) 20%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 88%, transparent))",
] as const;
const SHORTCUT_HINTS = [
  "Arrows Nudge/Seek",
  "Shift+Arrows x5",
  "Space Play/Pause",
  "S Split",
  "J/L Prev/Next Cut",
  "Delete Remove",
  "Enter Approve",
] as const;
const HELP_ITEMS = [
  "\u2190 / \u2192 - nudge selected split \u00b11 frame",
  "Shift+\u2190 / Shift+\u2192 - nudge selected split \u00b15 frames",
  "S - manual split at playback position",
  "Delete - remove selected split",
  "Space - play/pause",
  "J/L - prev/next cut",
  "Enter - approve and export",
  "Drag on timeline - auto-detect cut in region",
] as const;

function createClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSegment(
  start: number,
  end: number,
  thumbnailTime?: number,
  thumbnail: string | null = null,
  thumbnailDirty = true,
  splitSource: SplitSource = "auto",
  confidence: number | null = 1,
): ShotSegment {
  return {
    id: createClientId(),
    start,
    end,
    thumbnailTime: thumbnailTime ?? start + Math.max(end - start, 0) / 2,
    thumbnail,
    thumbnailDirty,
    splitSource,
    confidence,
  };
}

function clampTime(value: number, max: number) {
  return Math.min(Math.max(value, 0), max);
}

function roundTime(value: number) {
  return Number(value.toFixed(3));
}

function normalizeConfidence(value: unknown) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) {
    return null;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

function formatTimecode(value: number) {
  const clamped = Math.max(value, 0);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const milliseconds = Math.floor((clamped % 1) * 1000);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatDuration(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}s`;
}

function formatConfidence(confidence: number | null) {
  if (confidence === null) {
    return "Manual";
  }

  return `${Math.round(confidence * 100)}%`;
}

function formatNudgeFrames(frames: number) {
  if (frames === 0) {
    return "0 frames";
  }

  return `${frames > 0 ? "+" : ""}${frames} frame${Math.abs(frames) === 1 ? "" : "s"}`;
}

function getSplitSourceLabel(source: SplitSource) {
  switch (source) {
    case "auto":
      return "AI detected";
    case "detected":
      return "AI found via drag";
    case "manual":
      return "Human placed";
  }
}

function getSplitSourceShortLabel(source: SplitSource) {
  switch (source) {
    case "auto":
      return "auto";
    case "detected":
      return "drag";
    case "manual":
      return "manual";
  }
}

function getSplitSourceColor(source: SplitSource) {
  switch (source) {
    case "auto":
      return "var(--color-overlay-motion)";
    case "detected":
      return "var(--color-overlay-badge)";
    case "manual":
      return "var(--color-overlay-info)";
  }
}

function boundaryKey(value: number) {
  return roundTime(value).toFixed(3);
}

function getSegmentFingerprint(segment: Pick<ShotSegment, "start" | "end">) {
  return `${roundTime(segment.start).toFixed(3)}-${roundTime(segment.end).toFixed(3)}`;
}

function getTagDisplayLines(tags: string[]) {
  const visibleTags = tags.slice(0, 4);
  return [visibleTags.slice(0, 2).join(", "), visibleTags.slice(2, 4).join(", ")].filter(
    Boolean,
  );
}

function findSegmentIndexForSplit(segments: ShotSegment[], splitTime: number) {
  return segments.findIndex(
    (segment) =>
      splitTime > segment.start + SPLIT_EPSILON &&
      splitTime < segment.end - SPLIT_EPSILON,
  );
}

function insertSplitAtTime(
  currentSegments: ShotSegment[],
  splitTime: number,
  options?: {
    snapshot?: string | null;
    source?: SplitSource;
    confidence?: number | null;
  },
): SplitInsertResult {
  const segmentIndex = findSegmentIndexForSplit(currentSegments, splitTime);
  if (segmentIndex === -1) {
    return {
      nextSegments: currentSegments,
      insertedBoundaryId: null,
    };
  }

  const segment = currentSegments[segmentIndex];
  const snapshot = options?.snapshot ?? null;
  const splitSource = options?.source ?? "manual";
  const confidence = splitSource === "manual"
    ? null
    : normalizeConfidence(options?.confidence) ?? 1;
  const left = createSegment(
    segment.start,
    splitTime,
    segment.start + (splitTime - segment.start) / 2,
    segment.thumbnail,
    true,
    segment.splitSource,
    segment.confidence,
  );
  const right = createSegment(
    splitTime,
    segment.end,
    splitTime + (segment.end - splitTime) / 2,
    snapshot,
    snapshot ? false : true,
    splitSource,
    confidence,
  );

  const nextSegments = [...currentSegments];
  nextSegments.splice(segmentIndex, 1, left, right);

  return {
    nextSegments,
    insertedBoundaryId: right.id,
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  );
}

function parseReviewPayload(raw: unknown): ReviewPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Splits JSON must be an object.");
  }

  const candidate = raw as Partial<ReviewPayload>;
  if (!Array.isArray(candidate.splits)) {
    throw new Error("Splits JSON must include a 'splits' array.");
  }

  const normalizedSplits = candidate.splits.map((split, index) => {
    if (!split || typeof split !== "object") {
      throw new Error(`Split ${index + 1} is not valid.`);
    }

    const item = split as Partial<ReviewSplit>;
    const start = Number(item.start);
    const end = Number(item.end);
    const thumbnailTime = Number(item.thumbnail_time);
    const resolvedThumbnailTime = Number.isFinite(thumbnailTime)
      ? thumbnailTime
      : start + Math.max(end - start, 0) / 2;
    const splitSource = item.split_source ?? "auto";

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      Number.isNaN(resolvedThumbnailTime)
    ) {
      throw new Error(`Split ${index + 1} is missing numeric time values.`);
    }

    if (
      splitSource !== "auto" &&
      splitSource !== "detected" &&
      splitSource !== "manual"
    ) {
      throw new Error(`Split ${index + 1} has an invalid split_source.`);
    }

    return {
      start,
      end,
      thumbnail_time: resolvedThumbnailTime,
      split_source: splitSource,
      confidence:
        splitSource === "manual"
          ? null
          : normalizeConfidence(item.confidence) ?? 1,
    };
  });

  return {
    source_video:
      typeof candidate.source_video === "string" ? candidate.source_video : "",
    filename: typeof candidate.filename === "string" ? candidate.filename : "",
    total_duration: Number(candidate.total_duration) || 0,
    fps: Number(candidate.fps) || 0,
    splits: normalizedSplits,
  };
}

function buildSegments(splits: ReviewSplit[], totalDuration: number) {
  const duration = Math.max(totalDuration, 0);
  const normalized = [...splits]
    .sort((left, right) => left.start - right.start)
    .map((split) =>
      createSegment(
        clampTime(split.start, duration),
        clampTime(split.end, duration),
        clampTime(split.thumbnail_time, duration),
        null,
        true,
        split.split_source ?? "auto",
        split.split_source === "manual"
          ? null
          : normalizeConfidence(split.confidence) ?? 1,
      ),
    )
    .filter((segment) => segment.end > segment.start);

  if (normalized.length > 0) {
    return normalized;
  }

  return [createSegment(0, duration, duration / 2)];
}

function computeExportSummary(
  initialSegments: ShotSegment[],
  segments: ShotSegment[],
): ExportSummary {
  const initialBoundaries = new Set(
    initialSegments.slice(1).map((segment) => boundaryKey(segment.start)),
  );
  const currentBoundaries = new Set(
    segments.slice(1).map((segment) => boundaryKey(segment.start)),
  );

  let added = 0;
  let removed = 0;

  for (const value of currentBoundaries) {
    if (!initialBoundaries.has(value)) {
      added += 1;
    }
  }

  for (const value of initialBoundaries) {
    if (!currentBoundaries.has(value)) {
      removed += 1;
    }
  }

  return {
    shotCount: segments.length,
    added,
    removed,
  };
}

function downloadReviewJson(
  payload: ReviewPayload,
  filename: string,
  duration: number,
  segments: ShotSegment[],
) {
  const reviewExport = {
    source_video: payload.source_video,
    filename,
    total_duration: roundTime(duration),
    fps: payload.fps,
    splits: segments.map((segment, index) => {
      const rightBoundary = segments[index + 1];
      const splitSource = rightBoundary?.splitSource ?? segment.splitSource;
      const confidence =
        splitSource === "manual"
          ? null
          : rightBoundary?.confidence ?? segment.confidence ?? 1;

      return {
        start: roundTime(segment.start),
        end: roundTime(segment.end),
        thumbnail_time: roundTime(segment.thumbnailTime),
        split_source: splitSource,
        confidence,
      };
    }),
  };

  const blob = new Blob([`${JSON.stringify(reviewExport, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/\.[^.]+$/, "") + "-reviewed-splits.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readFileText(file: File) {
  return file.text();
}

type ReviewSplitsWorkspaceProps = {
  initialSplitsUrl?: string | null;
};

export function ReviewSplitsWorkspace({
  initialSplitsUrl,
}: ReviewSplitsWorkspaceProps) {
  const splitsUrlParam = initialSplitsUrl ?? null;

  const videoInputRef = useRef<HTMLInputElement>(null);
  const splitsInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureVideoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const thumbnailPendingRef = useRef(new Set<string>());
  const thumbnailLoopActiveRef = useRef(false);
  const tagPendingRef = useRef(new Set<string>());
  const tagLoopActiveRef = useRef(false);
  const playbackFrameRef = useRef<number | null>(null);
  const segmentsRef = useRef<ShotSegment[]>([]);
  const segmentTagsRef = useRef<Record<string, SegmentTagState>>({});
  const nudgeTimeoutRef = useRef<number | null>(null);
  const selectedBoundaryAnchorRef = useRef<{
    id: string;
    time: number;
  } | null>(null);
  const timelinePointerRef = useRef<{
    pointerId: number;
    selectionId: string;
    startRatio: number;
    currentRatio: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);
  const [initialSegments, setInitialSegments] = useState<ShotSegment[]>([]);
  const [segments, setSegments] = useState<ShotSegment[]>([]);
  const [pasteValue, setPasteValue] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoFps, setVideoFps] = useState(DEFAULT_FPS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string | null>(
    null,
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [nudgeFrameOffset, setNudgeFrameOffset] = useState<{
    id: string;
    frames: number;
  } | null>(null);
  const [lastAddedSegmentId, setLastAddedSegmentId] = useState<string | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<"video" | "splits" | null>(null);
  const [loadingSplitsFromUrl, setLoadingSplitsFromUrl] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);
  const [timelineSelection, setTimelineSelection] =
    useState<TimelineSelection | null>(null);
  const [detectedBoundaryIds, setDetectedBoundaryIds] = useState<string[]>([]);
  const [cutPreview, setCutPreview] = useState<CutPreview | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [segmentTags, setSegmentTags] = useState<Record<string, SegmentTagState>>(
    {},
  );

  const effectiveDuration = Math.max(
    videoDuration,
    reviewPayload?.total_duration ?? 0,
    segments.at(-1)?.end ?? 0,
  );

  segmentsRef.current = segments;
  segmentTagsRef.current = segmentTags;

  const activeShotIndex = useMemo(() => {
    const index = segments.findIndex(
      (segment, segmentIndex) =>
        currentTime >= segment.start &&
        (currentTime < segment.end ||
          segmentIndex === segments.length - 1 ||
          Math.abs(currentTime - segment.end) < 0.01),
    );

    return index === -1 ? 0 : index;
  }, [currentTime, segments]);

  const boundaries = useMemo(
    () =>
      segments.slice(1).map((segment, index) => ({
        id: segment.id,
        label: index + 1,
        time: segment.start,
        source: segment.splitSource,
        confidence: segment.confidence,
      })),
    [segments],
  );
  const selectedBoundary = boundaries.find(
    (boundary) => boundary.id === selectedBoundaryId,
  );
  const selectedCardSegment = segments.find((segment) => segment.id === selectedCardId);
  const frameDuration = 1 / Math.max(videoFps, 1);

  const workspaceReady = Boolean(videoUrl && reviewPayload && effectiveDuration >= 0);
  const summary = computeExportSummary(initialSegments, segments);

  function cancelPlaybackFrame() {
    if (playbackFrameRef.current !== null) {
      window.cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    }
  }

  function resetDerivedSegmentState() {
    thumbnailPendingRef.current.clear();
    thumbnailLoopActiveRef.current = false;
    tagPendingRef.current.clear();
    tagLoopActiveRef.current = false;
    setSegmentTags({});
  }

  useEffect(() => {
    if (!selectedBoundary) {
      selectedBoundaryAnchorRef.current = null;
      setNudgeFrameOffset(null);
      return;
    }

    if (selectedBoundaryAnchorRef.current?.id !== selectedBoundary.id) {
      selectedBoundaryAnchorRef.current = {
        id: selectedBoundary.id,
        time: selectedBoundary.time,
      };
      setNudgeFrameOffset(null);
    }
  }, [selectedBoundary]);

  useEffect(() => {
    return () => {
      cancelPlaybackFrame();
      if (nudgeTimeoutRef.current !== null) {
        window.clearTimeout(nudgeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!videoFile) {
      cancelPlaybackFrame();
      resetDerivedSegmentState();
      setVideoUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        return null;
      });
      return;
    }

    const nextUrl = URL.createObjectURL(videoFile);
    setVideoUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return nextUrl;
    });

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [videoFile]);

  useEffect(() => {
    if (!splitsUrlParam || reviewPayload || loadingSplitsFromUrl) {
      return;
    }

    let ignore = false;
    setLoadingSplitsFromUrl(true);

    void fetch(splitsUrlParam)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load splits from ${splitsUrlParam}.`);
        }

        const data = parseReviewPayload(await response.json());
        if (ignore) {
          return;
        }

        startTransition(() => {
          setReviewPayload(data);
          const builtSegments = buildSegments(data.splits, data.total_duration);
          setInitialSegments(builtSegments);
          setSegments(builtSegments);
          resetDerivedSegmentState();
          selectBoundary(null, { cardId: null });
          setVideoFps(data.fps > 0 ? data.fps : DEFAULT_FPS);
          setErrorMessage(null);
        });
      })
      .catch((error: unknown) => {
        if (ignore) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load splits JSON.",
        );
      })
      .finally(() => {
        if (!ignore) {
          setLoadingSplitsFromUrl(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [loadingSplitsFromUrl, reviewPayload, splitsUrlParam]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
      video.load();
    }

    const captureVideo = captureVideoRef.current;
    if (captureVideo) {
      captureVideo.pause();
      captureVideo.currentTime = 0;
      captureVideo.load();
    }

    cancelPlaybackFrame();
    setCurrentTime(0);
    setIsPlaying(false);
  }, [videoUrl]);

  useEffect(() => {
    if (!workspaceReady) {
      cancelPlaybackFrame();
      setIsPlaying(false);
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const syncTime = () => {
      setCurrentTime(video.currentTime || 0);
    };

    const tick = () => {
      syncTime();
      if (!video.paused && !video.ended) {
        playbackFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        playbackFrameRef.current = null;
      }
    };

    const startPlaybackSync = () => {
      cancelPlaybackFrame();
      playbackFrameRef.current = window.requestAnimationFrame(tick);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      startPlaybackSync();
    };

    const handlePause = () => {
      setIsPlaying(false);
      cancelPlaybackFrame();
      syncTime();
    };

    const handleEnded = () => {
      setIsPlaying(false);
      cancelPlaybackFrame();
      syncTime();
    };

    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration || 0);
      setVideoFps(reviewPayload?.fps && reviewPayload.fps > 0 ? reviewPayload.fps : DEFAULT_FPS);
      syncTime();
      if (!video.paused && !video.ended) {
        setIsPlaying(true);
        startPlaybackSync();
      }
    };

    handleLoadedMetadata();

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("seeking", syncTime);
    video.addEventListener("seeked", syncTime);
    video.addEventListener("timeupdate", syncTime);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      cancelPlaybackFrame();
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("seeking", syncTime);
      video.removeEventListener("seeked", syncTime);
      video.removeEventListener("timeupdate", syncTime);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [reviewPayload?.fps, workspaceReady]);

  useEffect(() => {
    if (!lastAddedSegmentId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLastAddedSegmentId(null);
    }, 1100);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [lastAddedSegmentId]);

  useEffect(() => {
    if (detectedBoundaryIds.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setDetectedBoundaryIds([]);
    }, 1400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [detectedBoundaryIds]);

  useEffect(() => {
    if (!timelineSelection || timelineSelection.status === "dragging") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimelineSelection((current) =>
        current?.id === timelineSelection.id && current.status !== "detecting"
          ? null
          : current,
      );
    }, timelineSelection.status === "success" ? 1600 : 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [timelineSelection]);

  useEffect(() => {
    if (!cutPreview) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCutPreview((current) =>
        current?.id === cutPreview.id ? null : current,
      );
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cutPreview]);

  useEffect(() => {
    const activeSegment = segments[activeShotIndex];
    if (!activeSegment) {
      return;
    }

    const element = cardRefs.current.get(activeSegment.id);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeShotIndex, segments]);

  useEffect(() => {
    if (!selectedCardId) {
      return;
    }

    if (!segments.some((segment) => segment.id === selectedCardId)) {
      setSelectedCardId(null);
      return;
    }

    const element = cardRefs.current.get(selectedCardId);
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [segments, selectedCardId]);

  // This listener intentionally tracks the latest editing state without memoizing every editor action.
  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!workspaceReady || isEditableTarget(event.target)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (selectedBoundaryId) {
          nudgeSelectedBoundary(event.shiftKey ? -5 : -1);
          return;
        }

        seekBy(event.shiftKey ? -SEEK_BIG_STEP : -SEEK_STEP);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (selectedBoundaryId) {
          nudgeSelectedBoundary(event.shiftKey ? 5 : 1);
          return;
        }

        seekBy(event.shiftKey ? SEEK_BIG_STEP : SEEK_STEP);
        return;
      }

      if (event.key === "j" || event.key === "J") {
        event.preventDefault();
        jumpToSplit("previous");
        return;
      }

      if (event.key === "l" || event.key === "L") {
        event.preventDefault();
        jumpToSplit("next");
        return;
      }

      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        splitAtCurrentTime();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedBoundaryId) {
          return;
        }

        event.preventDefault();
        removeBoundary(selectedBoundaryId);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        approveSplits();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceReady, selectedBoundaryId]);

  useEffect(() => {
    if (!workspaceReady || !videoUrl) {
      return;
    }

    const captureVideo = captureVideoRef.current;
    const canvas = captureCanvasRef.current;
    if (!captureVideo || !canvas || thumbnailLoopActiveRef.current) {
      return;
    }

    const waitForMetadata = async () => {
      if (captureVideo.readyState >= 1) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const handleLoadedMetadata = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error("Unable to read video metadata for thumbnails."));
        };
        const cleanup = () => {
          captureVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
          captureVideo.removeEventListener("error", handleError);
        };

        captureVideo.addEventListener("loadedmetadata", handleLoadedMetadata);
        captureVideo.addEventListener("error", handleError);
        captureVideo.load();
      });
    };

    const seekCaptureVideo = async (time: number) => {
      const target = clampTime(time, captureVideo.duration || effectiveDuration);
      if (Math.abs(captureVideo.currentTime - target) < 0.03) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const handleSeeked = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error("Unable to seek video for thumbnail capture."));
        };
        const cleanup = () => {
          captureVideo.removeEventListener("seeked", handleSeeked);
          captureVideo.removeEventListener("error", handleError);
        };

        captureVideo.addEventListener("seeked", handleSeeked, { once: true });
        captureVideo.addEventListener("error", handleError, { once: true });
        captureVideo.currentTime = target;
      });
    };

    const captureThumbnail = async (segment: ShotSegment) => {
      await waitForMetadata();
      await seekCaptureVideo(segment.thumbnailTime);

      const width = captureVideo.videoWidth || 320;
      const height = captureVideo.videoHeight || 180;
      const targetWidth = Math.min(width, 480);
      const targetHeight = Math.max(
        1,
        Math.round((height / Math.max(width, 1)) * targetWidth),
      );

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.drawImage(captureVideo, 0, 0, targetWidth, targetHeight);
      return canvas.toDataURL("image/jpeg", 0.82);
    };

    const processQueue = async () => {
      thumbnailLoopActiveRef.current = true;

      try {
        await waitForMetadata();

        while (true) {
          const nextSegment = segmentsRef.current.find(
            (segment) =>
              segment.thumbnailDirty && !thumbnailPendingRef.current.has(segment.id),
          );

          if (!nextSegment) {
            break;
          }

          thumbnailPendingRef.current.add(nextSegment.id);

          try {
            const thumbnail = await captureThumbnail(nextSegment);
            if (thumbnail) {
              setSegments((currentSegments) =>
                currentSegments.map((segment) =>
                  segment.id === nextSegment.id
                    ? { ...segment, thumbnail, thumbnailDirty: false }
                    : segment,
                ),
              );
            }
          } catch {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 120);
            });
          } finally {
            thumbnailPendingRef.current.delete(nextSegment.id);
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
          });
        }
      } finally {
        thumbnailLoopActiveRef.current = false;
      }
    };

    void processQueue();
  }, [effectiveDuration, segments, videoUrl, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || tagLoopActiveRef.current) {
      return;
    }

    const hasPendingAnalysis = segments.some((segment) => {
      if (!segment.thumbnail || segment.thumbnailDirty || tagPendingRef.current.has(segment.id)) {
        return false;
      }

      const tagState = segmentTagsRef.current[segment.id];
      return !tagState || tagState.analyzedThumbnail !== segment.thumbnail;
    });

    if (!hasPendingAnalysis) {
      return;
    }

    const processQueue = async () => {
      tagLoopActiveRef.current = true;

      try {
        while (true) {
          const nextSegmentIndex = segmentsRef.current.findIndex((segment) => {
            if (!segment.thumbnail || segment.thumbnailDirty) {
              return false;
            }

            const tagState = segmentTagsRef.current[segment.id];
            return (
              !tagPendingRef.current.has(segment.id) &&
              (!tagState || tagState.analyzedThumbnail !== segment.thumbnail)
            );
          });

          if (nextSegmentIndex === -1) {
            break;
          }

          const nextSegment = segmentsRef.current[nextSegmentIndex];
          if (!nextSegment?.thumbnail) {
            break;
          }

          tagPendingRef.current.add(nextSegment.id);
          setSegmentTags((current) => ({
            ...current,
            [nextSegment.id]: {
              status: "loading",
              tags: current[nextSegment.id]?.tags ?? [],
              analyzedThumbnail: current[nextSegment.id]?.analyzedThumbnail ?? null,
            },
          }));

          try {
            const tags = await analyzeFrameTags(
              nextSegment.thumbnail,
              `Shot ${nextSegmentIndex + 1}, ${formatTimecode(nextSegment.start)} to ${formatTimecode(nextSegment.end)}, segment ${getSegmentFingerprint(nextSegment)}.`,
            );
            setSegmentTags((current) => ({
              ...current,
              [nextSegment.id]: {
                status: "ready",
                tags,
                analyzedThumbnail: nextSegment.thumbnail ?? null,
              },
            }));
          } catch {
            setSegmentTags((current) => ({
              ...current,
              [nextSegment.id]: {
                status: "error",
                tags: current[nextSegment.id]?.tags ?? [],
                analyzedThumbnail: nextSegment.thumbnail ?? null,
              },
            }));
          } finally {
            tagPendingRef.current.delete(nextSegment.id);
          }

          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 0);
          });
        }
      } finally {
        tagLoopActiveRef.current = false;
      }
    };

    void processQueue();
  }, [segments, segmentTags, workspaceReady]);

  function getTimelineRatio(clientX: number) {
    const timeline = timelineRef.current;
    if (!timeline) {
      return 0;
    }

    const bounds = timeline.getBoundingClientRect();
    return clampTime((clientX - bounds.left) / Math.max(bounds.width, 1), 1);
  }

  function buildTimelineSelection(
    startRatio: number,
    endRatio: number,
    status: TimelineSelectionStatus,
    message?: string,
    id = createClientId(),
  ): TimelineSelection {
    const startTime = roundTime(
      Math.min(startRatio, endRatio) * Math.max(effectiveDuration, 0),
    );
    const endTime = roundTime(
      Math.max(startRatio, endRatio) * Math.max(effectiveDuration, 0),
    );

    return {
      id,
      startTime,
      endTime,
      status,
      message,
    };
  }

  async function captureFrameAtTime(time: number) {
    if (!videoUrl) {
      return null;
    }

    const captureVideo = document.createElement("video");
    captureVideo.preload = "auto";
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    captureVideo.src = videoUrl;

    const waitForMetadata = async () => {
      if (captureVideo.readyState >= 1) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const handleLoadedMetadata = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error("Unable to read video metadata for frame preview."));
        };
        const cleanup = () => {
          captureVideo.removeEventListener("loadedmetadata", handleLoadedMetadata);
          captureVideo.removeEventListener("error", handleError);
        };

        captureVideo.addEventListener("loadedmetadata", handleLoadedMetadata);
        captureVideo.addEventListener("error", handleError);
      });
    };

    const seekToTime = async (targetTime: number) => {
      await new Promise<void>((resolve, reject) => {
        const handleSeeked = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error("Unable to seek video for frame preview."));
        };
        const cleanup = () => {
          captureVideo.removeEventListener("seeked", handleSeeked);
          captureVideo.removeEventListener("error", handleError);
        };

        captureVideo.addEventListener("seeked", handleSeeked, { once: true });
        captureVideo.addEventListener("error", handleError, { once: true });
        captureVideo.currentTime = clampTime(targetTime, captureVideo.duration || effectiveDuration);
      });
    };

    try {
      await waitForMetadata();
      await seekToTime(time);

      const canvas = document.createElement("canvas");
      const width = captureVideo.videoWidth || 320;
      const height = captureVideo.videoHeight || 180;
      const targetWidth = Math.min(width, 320);
      const targetHeight = Math.max(
        1,
        Math.round((height / Math.max(width, 1)) * targetWidth),
      );

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.drawImage(captureVideo, 0, 0, targetWidth, targetHeight);
      return canvas.toDataURL("image/jpeg", 0.84);
    } finally {
      captureVideo.pause();
      captureVideo.removeAttribute("src");
      captureVideo.load();
    }
  }

  async function showCutPreviewAtTime(boundary: {
    time: number;
    confidence: number | null;
    source: SplitSource;
  }) {
    const beforeTime = clampTime(boundary.time - frameDuration, effectiveDuration);
    const afterTime = clampTime(boundary.time + frameDuration, effectiveDuration);

    const [beforeFrame, afterFrame] = await Promise.all([
      captureFrameAtTime(beforeTime),
      captureFrameAtTime(afterTime),
    ]);

    if (!beforeFrame || !afterFrame) {
      return;
    }

    setCutPreview({
      id: createClientId(),
      time: boundary.time,
      confidence: boundary.confidence,
      source: boundary.source,
      beforeFrame,
      afterFrame,
    });
  }

  async function requestRegionDetection(startTime: number, endTime: number) {
    if (!reviewPayload?.source_video) {
      throw new Error("The loaded splits JSON is missing a source_video path.");
    }

    const response = await fetch("/api/detect-split", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourcePath: reviewPayload.source_video,
        startTime,
        endTime,
      }),
    });

    const payload = (await response.json()) as {
      cuts?: DetectedCut[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to detect cuts in the selected region.");
    }

    return Array.isArray(payload.cuts) ? payload.cuts : [];
  }

  async function analyzeFrameTags(image: string, context: string) {
    const response = await fetch("/api/analyze-frame", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image,
        context,
      }),
    });

    const payload = (await response.json()) as {
      tags?: string[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || "Unable to analyze frame.");
    }

    return Array.isArray(payload.tags) ? payload.tags : [];
  }

  function seekTo(time: number) {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const nextTime = clampTime(time, effectiveDuration);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function seekBy(delta: number) {
    seekTo(currentTime + delta);
  }

  function selectBoundary(
    boundary: Pick<SplitBoundary, "id" | "time"> | null,
    options?: { cardId?: string | null },
  ) {
    setSelectedBoundaryId(boundary?.id ?? null);
    if (options && "cardId" in options) {
      setSelectedCardId(options.cardId ?? null);
    }
    selectedBoundaryAnchorRef.current = boundary
      ? { id: boundary.id, time: boundary.time }
      : null;
    setNudgeFrameOffset(null);
  }

  function getCardSelectionForIndex(index: number) {
    if (index === 0) {
      const nextSegment = segments[1];
      return {
        boundary: nextSegment
          ? {
              id: nextSegment.id,
              time: nextSegment.start,
            }
          : null,
        cardId: segments[0]?.id ?? null,
      };
    }

    const segment = segments[index];
    return segment
      ? {
          boundary: {
            id: segment.id,
            time: segment.start,
          },
          cardId: segment.id,
        }
      : { boundary: null, cardId: null };
  }

  function handleSegmentCardSelect(segment: ShotSegment, index: number) {
    const selection = getCardSelectionForIndex(index);
    seekTo(segment.start);
    selectBoundary(selection.boundary, { cardId: selection.cardId });
  }

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      await video.play();
      return;
    }

    video.pause();
  }

  function jumpToSplit(direction: "previous" | "next") {
    if (boundaries.length === 0) {
      return;
    }

    const times = boundaries.map((boundary) => boundary.time);

    if (direction === "previous") {
      const targetTime = [...times]
        .reverse()
        .find((time) => time < currentTime - 0.05);
      if (typeof targetTime === "number") {
        seekTo(targetTime);
      }
      return;
    }

    const targetTime = times.find((time) => time > currentTime + 0.05);
    if (typeof targetTime === "number") {
      seekTo(targetTime);
    }
  }

  function captureCurrentFrame() {
    const video = videoRef.current;
    if (!video) {
      return null;
    }

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 320;
    const height = video.videoHeight || 180;
    const targetWidth = Math.min(width, 480);
    const targetHeight = Math.max(
      1,
      Math.round((height / Math.max(width, 1)) * targetWidth),
    );

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function splitAtCurrentTime() {
    const splitTime = roundTime(clampTime(currentTime, effectiveDuration));
    if (findSegmentIndexForSplit(segments, splitTime) === -1) {
      return;
    }

    const snapshot = captureCurrentFrame();

    setSegments((currentSegments) => {
      const result = insertSplitAtTime(currentSegments, splitTime, {
        snapshot,
        source: "manual",
        confidence: null,
      });
      if (result.insertedBoundaryId) {
        selectBoundary(
          { id: result.insertedBoundaryId, time: splitTime },
          { cardId: result.insertedBoundaryId },
        );
        setLastAddedSegmentId(result.insertedBoundaryId);
      }
      return result.nextSegments;
    });
  }

  function queueNudgeIndicator(boundaryId: string, frameOffset: number) {
    setNudgeFrameOffset({ id: boundaryId, frames: frameOffset });

    if (nudgeTimeoutRef.current !== null) {
      window.clearTimeout(nudgeTimeoutRef.current);
    }

    nudgeTimeoutRef.current = window.setTimeout(() => {
      setNudgeFrameOffset((current) =>
        current?.id === boundaryId ? null : current,
      );
    }, 1000);
  }

  function nudgeSelectedBoundary(frameOffset: number) {
    if (!selectedBoundaryId) {
      return;
    }

    let nextBoundary: SplitBoundary | null = null;

    setSegments((currentSegments) => {
      const index = currentSegments.findIndex(
        (segment) => segment.id === selectedBoundaryId,
      );
      if (index <= 0) {
        return currentSegments;
      }

      const previous = currentSegments[index - 1];
      const current = currentSegments[index];
      const minBoundaryTime =
        previous.start + Math.max(SPLIT_EPSILON, frameDuration);
      const maxBoundaryTime =
        current.end - Math.max(SPLIT_EPSILON, frameDuration);
      if (maxBoundaryTime <= minBoundaryTime) {
        return currentSegments;
      }

      const nextTime = roundTime(
        Math.min(
          Math.max(current.start + frameOffset * frameDuration, minBoundaryTime),
          maxBoundaryTime,
        ),
      );
      if (Math.abs(nextTime - current.start) < 0.0005) {
        return currentSegments;
      }

      const updatedPrevious: ShotSegment = {
        ...previous,
        end: nextTime,
        thumbnailTime: previous.start + (nextTime - previous.start) / 2,
        thumbnailDirty: true,
      };
      const updatedCurrent: ShotSegment = {
        ...current,
        start: nextTime,
        thumbnailTime: nextTime + (current.end - nextTime) / 2,
        thumbnailDirty: true,
      };

      nextBoundary = {
        id: updatedCurrent.id,
        label: index,
        time: nextTime,
        source: updatedCurrent.splitSource,
        confidence: updatedCurrent.confidence,
      };

      const nextSegments = [...currentSegments];
      nextSegments.splice(index - 1, 2, updatedPrevious, updatedCurrent);
      return nextSegments;
    });

    const resolvedBoundary = nextBoundary as SplitBoundary | null;
    if (!resolvedBoundary) {
      return;
    }

    const anchorTime =
      selectedBoundaryAnchorRef.current?.id === resolvedBoundary.id
        ? selectedBoundaryAnchorRef.current.time
        : resolvedBoundary.time;
    const frameDelta = Math.round((resolvedBoundary.time - anchorTime) / frameDuration);
    selectBoundary(resolvedBoundary);
    selectedBoundaryAnchorRef.current = {
      id: resolvedBoundary.id,
      time: anchorTime,
    };
    seekTo(resolvedBoundary.time);
    queueNudgeIndicator(resolvedBoundary.id, frameDelta);

    if (cutPreview) {
      void showCutPreviewAtTime(resolvedBoundary);
    }
  }

  async function detectCutsInRegion(startTime: number, endTime: number) {
    const selectionId = createClientId();
    const baseSelection = {
      id: selectionId,
      startTime,
      endTime,
    };

    setTimelineSelection({
      ...baseSelection,
      status: "detecting",
      message: "Detecting...",
    });
    setErrorMessage(null);

    try {
      const detectedCuts = (await requestRegionDetection(startTime, endTime))
        .map((cut) => ({
          time: roundTime(clampTime(cut.time, effectiveDuration)),
          confidence: normalizeConfidence(cut.confidence) ?? 0,
        }))
        .sort((left, right) => left.time - right.time);

      if (detectedCuts.length === 0) {
        setTimelineSelection({
          ...baseSelection,
          status: "empty",
          message: "No cuts detected",
        });
        return;
      }

      const insertedCuts: DetectedCut[] = [];
      const insertedBoundaryIds: string[] = [];

      setSegments((currentSegments) => {
        let nextSegments = currentSegments;

        for (const cut of detectedCuts) {
          const result = insertSplitAtTime(nextSegments, cut.time, {
            source: "detected",
            confidence: cut.confidence,
          });
          if (!result.insertedBoundaryId) {
            continue;
          }

          nextSegments = result.nextSegments;
          insertedCuts.push(cut);
          insertedBoundaryIds.push(result.insertedBoundaryId);
        }

        return nextSegments;
      });

      if (insertedBoundaryIds.length === 0 || insertedCuts.length === 0) {
        setTimelineSelection({
          ...baseSelection,
          status: "empty",
          message: "Cuts already exist here",
        });
        return;
      }

      const strongestCut = insertedCuts[0] ?? null;
      if (insertedBoundaryIds[0] && strongestCut) {
        selectBoundary({
          id: insertedBoundaryIds[0],
          time: strongestCut.time,
        }, { cardId: insertedBoundaryIds[0] });
      }
      setLastAddedSegmentId(insertedBoundaryIds[0] ?? null);
      setDetectedBoundaryIds(insertedBoundaryIds);
      setTimelineSelection({
        ...baseSelection,
        status: "success",
        message: "Strongest cut snapped into place",
      });

      if (strongestCut) {
        void showCutPreviewAtTime({
          time: strongestCut.time,
          confidence: strongestCut.confidence,
          source: "detected",
        });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Split detection failed.";

      setTimelineSelection({
        ...baseSelection,
        status: "error",
        message: "Detection failed",
      });
      setErrorMessage(message);
    }
  }

  function removeBoundary(boundaryId: string) {
    setSegments((currentSegments) => {
      const index = currentSegments.findIndex((segment) => segment.id === boundaryId);
      if (index <= 0) {
        return currentSegments;
      }

      const previous = currentSegments[index - 1];
      const current = currentSegments[index];
      const merged = createSegment(
        previous.start,
        current.end,
        previous.start + (current.end - previous.start) / 2,
        previous.thumbnail ?? current.thumbnail,
        true,
        previous.splitSource,
        previous.confidence,
      );

      const nextSegments = [...currentSegments];
      nextSegments.splice(index - 1, 2, merged);

      const nextSelected =
        nextSegments[index]?.id ?? nextSegments[index - 1]?.id ?? null;
      selectBoundary(
        nextSelected
          ? {
              id: nextSelected,
              time:
                nextSegments.find((segment) => segment.id === nextSelected)?.start ?? 0,
            }
          : null,
        { cardId: nextSelected },
      );
      return nextSegments;
    });
  }

  function approveSplits() {
    if (!reviewPayload || !videoFile) {
      return;
    }

    downloadReviewJson(reviewPayload, videoFile.name, effectiveDuration, segments);
    setExportSummary(summary);
  }

  function loadParsedSplits(parsedPayload: ReviewPayload) {
    startTransition(() => {
      const builtSegments = buildSegments(
        parsedPayload.splits,
        parsedPayload.total_duration,
      );
      resetDerivedSegmentState();
      setReviewPayload(parsedPayload);
      setInitialSegments(builtSegments);
      setSegments(builtSegments);
      selectBoundary(null, { cardId: null });
      setCurrentTime(0);
      setVideoFps(parsedPayload.fps > 0 ? parsedPayload.fps : DEFAULT_FPS);
      setExportSummary(null);
      setErrorMessage(null);
      setTimelineSelection(null);
      setDetectedBoundaryIds([]);
      setCutPreview(null);
    });
  }

  async function handleVideoSelection(file: File | null) {
    if (!file) {
      return;
    }

    cancelPlaybackFrame();
    resetDerivedSegmentState();
    setSegments((currentSegments) =>
      currentSegments.map((segment) => ({
        ...segment,
        thumbnail: null,
        thumbnailDirty: true,
      })),
    );
    setVideoFile(file);
    setVideoDuration(0);
    setVideoFps(reviewPayload?.fps && reviewPayload.fps > 0 ? reviewPayload.fps : DEFAULT_FPS);
    setCurrentTime(0);
    setIsPlaying(false);
    selectBoundary(null, { cardId: null });
    setExportSummary(null);
    setErrorMessage(null);
    setTimelineSelection(null);
    setCutPreview(null);
  }

  async function handleSplitsSelection(file: File | null) {
    if (!file) {
      return;
    }

    try {
      const text = await readFileText(file);
      setPasteValue(text);
      loadParsedSplits(parseReviewPayload(JSON.parse(text)));
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load splits JSON.",
      );
    }
  }

  async function handleVideoInputChange(event: ChangeEvent<HTMLInputElement>) {
    await handleVideoSelection(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  async function handleSplitsInputChange(event: ChangeEvent<HTMLInputElement>) {
    await handleSplitsSelection(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  async function handleDrop(
    event: DragEvent<HTMLButtonElement | HTMLDivElement>,
    target: "video" | "splits",
  ) {
    event.preventDefault();
    setDropTarget(null);

    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    if (target === "video") {
      await handleVideoSelection(file);
      return;
    }

    await handleSplitsSelection(file);
  }

  function loadPastedJson() {
    try {
      loadParsedSplits(parseReviewPayload(JSON.parse(pasteValue)));
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to parse pasted JSON.",
      );
    }
  }

  function handleTimelinePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || timelineSelection?.status === "detecting") {
      return;
    }

    event.preventDefault();
    selectBoundary(null, { cardId: null });
    const ratio = getTimelineRatio(event.clientX);
    const selectionId = createClientId();
    timelinePointerRef.current = {
      pointerId: event.pointerId,
      selectionId,
      startRatio: ratio,
      currentRatio: ratio,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setCutPreview(null);
  }

  function handleTimelinePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = timelinePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }

    const ratio = getTimelineRatio(event.clientX);
    pointer.currentRatio = ratio;
    const distance = Math.hypot(
      event.clientX - pointer.startClientX,
      event.clientY - pointer.startClientY,
    );
    if (distance < TIMELINE_CLICK_MOVE_THRESHOLD) {
      return;
    }

    setTimelineSelection(
      buildTimelineSelection(
        pointer.startRatio,
        ratio,
        "dragging",
        undefined,
        pointer.selectionId,
      ),
    );
  }

  function clearTimelinePointer(pointerId?: number) {
    const timeline = timelineRef.current;
    if (timeline && pointerId !== undefined && timeline.hasPointerCapture(pointerId)) {
      timeline.releasePointerCapture(pointerId);
    }
    timelinePointerRef.current = null;
  }

  function handleTimelinePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = timelinePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }

    const endRatio = getTimelineRatio(event.clientX);
    const startRatio = pointer.startRatio;
    const distance = Math.hypot(
      event.clientX - pointer.startClientX,
      event.clientY - pointer.startClientY,
    );
    clearTimelinePointer(event.pointerId);

    if (distance < TIMELINE_CLICK_MOVE_THRESHOLD) {
      setTimelineSelection(null);
      seekTo(endRatio * effectiveDuration);
      return;
    }

    const startTime = roundTime(
      Math.min(startRatio, endRatio) * Math.max(effectiveDuration, 0),
    );
    const endTime = roundTime(
      Math.max(startRatio, endRatio) * Math.max(effectiveDuration, 0),
    );

    void detectCutsInRegion(startTime, endTime);
  }

  function handleTimelinePointerCancel(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const pointer = timelinePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) {
      return;
    }

    clearTimelinePointer(event.pointerId);
    setTimelineSelection(null);
  }

  function handleCardKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    segment: ShotSegment,
  ) {
    if (event.key === "Delete" || event.key === "Backspace") {
      if (segments.length < 2) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const segmentIndex = segments.findIndex((item) => item.id === segment.id);
      const boundaryId =
        segmentIndex === 0 ? segments[1]?.id ?? null : segment.id;
      if (boundaryId) {
        removeBoundary(boundaryId);
      }
    }
  }

  const timelineSelectionMetrics = timelineSelection
    ? {
        left: `${
          (timelineSelection.startTime / Math.max(effectiveDuration, 0.001)) * 100
        }%`,
        width: `${
          ((timelineSelection.endTime - timelineSelection.startTime) /
            Math.max(effectiveDuration, 0.001)) *
          100
        }%`,
      }
    : null;

  const cutPreviewLeft = cutPreview
    ? `${(cutPreview.time / Math.max(effectiveDuration, 0.001)) * 100}%`
    : "0%";
  const selectedCardIndex = selectedCardSegment
    ? segments.findIndex((segment) => segment.id === selectedCardSegment.id) + 1
    : null;

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at top left, color-mix(in oklch, var(--color-accent-base) 18%, transparent) 0%, transparent 34%), radial-gradient(circle at 85% 18%, color-mix(in oklch, var(--color-signal-violet) 14%, transparent) 0%, transparent 30%), radial-gradient(circle at 50% 100%, color-mix(in oklch, var(--color-status-verified) 10%, transparent) 0%, transparent 28%)",
        }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {!workspaceReady ? (
          <motion.div
            key="review-splits-empty"
            initial={{ opacity: 0, scale: 0.985, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-full items-center justify-center px-5 py-10 sm:px-8"
          >
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="max-w-3xl">
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
                Shot Boundary Review
              </p>
              <h1
                className="mt-3 text-4xl font-semibold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Trim the false cuts. Keep the flow.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-[var(--color-text-secondary)] sm:text-lg">
                Load the source video and the detected splits JSON. Everything
                stays local in the browser, so you can review fast without
                upload latency.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget("video");
                }}
                onDragLeave={() => setDropTarget((current) => (current === "video" ? null : current))}
                onDrop={(event) => void handleDrop(event, "video")}
                className="group relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[28px] border p-8 text-left shadow-[var(--shadow-xl)] transition-transform hover:-translate-y-0.5"
                style={{
                  background:
                    "linear-gradient(160deg, color-mix(in oklch, var(--color-surface-secondary) 92%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 84%, transparent))",
                  borderColor:
                    dropTarget === "video"
                      ? "color-mix(in oklch, var(--color-accent-light) 72%, transparent)"
                      : "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-80 transition-opacity group-hover:opacity-100"
                  style={{
                    background:
                      "linear-gradient(135deg, transparent 18%, color-mix(in oklch, var(--color-accent-base) 10%, transparent) 100%)",
                  }}
                />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                      Step 1
                    </p>
                    <p className="mt-2 text-xl font-semibold">Load source video</p>
                  </div>
                  <div className="rounded-full border border-[color:color-mix(in_oklch,var(--color-accent-base)_38%,transparent)] bg-[color:color-mix(in_oklch,var(--color-accent-base)_12%,transparent)] p-4 text-[var(--color-text-accent)]">
                    <Film className="size-8" />
                  </div>
                </div>

                <div className="relative flex items-end justify-between gap-4">
                  <div>
                    <p className="text-lg text-[var(--color-text-primary)]">
                      Drop your video here or click to select.
                    </p>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                      Handles local MP4 and large source files without uploading.
                    </p>
                  </div>
                  <div className="rounded-full border border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_56%,transparent)] px-4 py-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                    {videoFile ? videoFile.name : "Video pending"}
                  </div>
                </div>
              </button>

              <div className="grid gap-6">
                <button
                  type="button"
                  onClick={() => splitsInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTarget("splits");
                  }}
                  onDragLeave={() => setDropTarget((current) => (current === "splits" ? null : current))}
                  onDrop={(event) => void handleDrop(event, "splits")}
                  className="relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-[24px] border p-6 text-left shadow-[var(--shadow-lg)] transition-transform hover:-translate-y-0.5"
                  style={{
                    background:
                      "linear-gradient(160deg, color-mix(in oklch, var(--color-surface-secondary) 96%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 88%, transparent))",
                    borderColor:
                      dropTarget === "splits"
                        ? "color-mix(in oklch, var(--color-accent-light) 72%, transparent)"
                        : "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        Step 2
                      </p>
                      <p className="mt-2 text-lg font-semibold">Load splits JSON</p>
                    </div>
                    <FileJson className="size-6 text-[var(--color-text-accent)]" />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--color-text-primary)]">
                      Drop the detector output here, paste it below, or preload via
                      the `?splits=` query param.
                    </p>
                    <p className="mt-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                      {reviewPayload
                        ? `${reviewPayload.splits.length} shots loaded`
                        : loadingSplitsFromUrl
                          ? "Loading from URL"
                          : "JSON pending"}
                    </p>
                  </div>
                </button>

                <div
                  className="rounded-[24px] border p-5 shadow-[var(--shadow-lg)]"
                  style={{
                    background:
                      "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 96%, transparent), color-mix(in oklch, var(--color-surface-primary) 100%, transparent))",
                    borderColor:
                      "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      Paste splits JSON
                    </p>
                    <button
                      type="button"
                      onClick={loadPastedJson}
                      className={cn(
                        buttonVariants({ size: "sm" }),
                        "rounded-full px-4",
                      )}
                    >
                      Load JSON
                    </button>
                  </div>
                  <textarea
                    value={pasteValue}
                    onChange={(event) => setPasteValue(event.target.value)}
                    spellCheck={false}
                    placeholder='{"source_video":"...","splits":[...]}'
                    className="mt-4 h-52 w-full resize-none rounded-[18px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_76%,transparent)] px-4 py-3 font-mono text-xs leading-6 text-[var(--color-text-secondary)] placeholder:text-[var(--color-text-tertiary)]"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <div className="rounded-full border border-[var(--color-border-default)] px-3 py-1.5 font-mono uppercase tracking-[var(--letter-spacing-wide)]">
                No uploads
              </div>
              <div className="rounded-full border border-[var(--color-border-default)] px-3 py-1.5 font-mono uppercase tracking-[var(--letter-spacing-wide)]">
                Keyboard-first
              </div>
              <div className="rounded-full border border-[var(--color-border-default)] px-3 py-1.5 font-mono uppercase tracking-[var(--letter-spacing-wide)]">
                Instant export
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-[18px] border border-[color:color-mix(in_oklch,var(--color-status-error)_48%,transparent)] bg-[color:color-mix(in_oklch,var(--color-status-error)_12%,transparent)] px-4 py-3 text-sm text-[var(--color-text-primary)]">
                {errorMessage}
              </div>
            ) : null}
            </div>

            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => void handleVideoInputChange(event)}
            />
            <input
              ref={splitsInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void handleSplitsInputChange(event)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="review-splits-workspace"
            initial={{ opacity: 0, scale: 0.985, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.99, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-full flex-col overflow-hidden p-[var(--space-4)]"
          >
            <LayoutGroup>
              <div
                className="flex min-h-0 flex-1 flex-col gap-[var(--space-4)] rounded-[28px] border p-[var(--space-4)] shadow-[var(--shadow-xl)]"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 96%, transparent), color-mix(in oklch, var(--color-surface-primary) 100%, transparent))",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                }}
              >
                <section className="flex h-12 flex-none items-center justify-between gap-[var(--space-3)] rounded-[18px] border border-[color:color-mix(in_oklch,var(--color-border-default)_72%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_56%,transparent)] px-[var(--space-4)] shadow-[var(--shadow-md)] backdrop-blur-xl">
                  <div className="flex min-w-0 items-center gap-[var(--space-3)]">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        {videoFile?.name ?? reviewPayload?.filename}
                      </p>
                    </div>
                    <div className="hidden h-5 w-px bg-[color:color-mix(in_oklch,var(--color-border-default)_64%,transparent)] md:block" />
                    <div className="hidden items-center gap-[var(--space-2)] md:flex">
                      <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_70%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        {segments.length} shots
                      </span>
                      <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_70%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        {formatTimecode(currentTime)} / {formatTimecode(effectiveDuration)}
                      </span>
                      <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_70%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        {videoFps.toFixed(3)} fps
                      </span>
                      <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_70%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        +{summary.added} / -{summary.removed}
                      </span>
                      <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_70%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        {selectedBoundary
                          ? `${selectedCardIndex ? `Shot ${selectedCardIndex}` : "Cut"} ${formatTimecode(selectedBoundary.time)}`
                          : "No cut selected"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-none items-center gap-[var(--space-2)]">
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "hidden rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] px-3 text-[var(--color-text-secondary)] lg:inline-flex",
                      )}
                    >
                      <Upload />
                      Video
                    </button>
                    <button
                      type="button"
                      onClick={() => splitsInputRef.current?.click()}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "hidden rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] px-3 text-[var(--color-text-secondary)] lg:inline-flex",
                      )}
                    >
                      <FileJson />
                      Splits
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setHelpOpen((current) => !current)}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "icon" }),
                          "rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] text-[var(--color-text-secondary)]",
                        )}
                        aria-label="Show review controls help"
                        aria-expanded={helpOpen}
                      >
                        <CircleHelp />
                      </button>

                      <AnimatePresence>
                        {helpOpen ? (
                          <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute right-0 top-[calc(100%+10px)] z-40 w-[min(320px,calc(100vw-48px))] rounded-[20px] border border-[color:color-mix(in_oklch,var(--color-border-default)_80%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_94%,transparent)] p-4 shadow-[var(--shadow-xl)] backdrop-blur-xl"
                          >
                            <p className="font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
                              Review Controls
                            </p>
                            <div className="mt-3 space-y-2">
                              {HELP_ITEMS.map((item) => (
                                <p
                                  key={item}
                                  className="text-sm text-[var(--color-text-secondary)]"
                                >
                                  {item}
                                </p>
                              ))}
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                    <Button
                      onClick={approveSplits}
                      className="h-9 rounded-full bg-[var(--color-status-verified)] px-4 text-[var(--color-surface-primary)] shadow-[0_0_24px_color-mix(in_oklch,var(--color-status-verified)_28%,transparent)] hover:bg-[var(--color-status-verified)]"
                    >
                      <Check />
                      Approve
                    </Button>
                  </div>
                </section>

                <section className="flex min-h-0 flex-1 flex-col gap-[var(--space-4)]">
                  <div className="min-h-0 flex-1 rounded-[24px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_72%,transparent)] p-[var(--space-4)]">
                    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[20px] border border-[color:color-mix(in_oklch,var(--color-border-default)_62%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_84%,transparent)]">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "radial-gradient(circle at 50% 12%, color-mix(in oklch, var(--color-accent-base) 12%, transparent) 0%, transparent 42%), radial-gradient(circle at 0% 100%, color-mix(in oklch, var(--color-signal-violet) 10%, transparent) 0%, transparent 38%)",
                        }}
                      />

                      <video
                        ref={videoRef}
                        src={videoUrl ?? undefined}
                        controls={false}
                        preload="metadata"
                        className="h-full w-full object-contain"
                      />

                      <div className="pointer-events-none absolute left-[var(--space-4)] top-[var(--space-4)] flex flex-wrap items-center gap-[var(--space-2)]">
                        <div className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_76%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_62%,transparent)] px-3 py-1.5 shadow-[var(--shadow-md)] backdrop-blur-xl">
                          <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                            Active Shot
                          </p>
                          <p className="mt-1 font-mono text-xs text-[var(--color-text-primary)]">
                            #{activeShotIndex + 1} ·{" "}
                            {formatDuration(
                              (segments[activeShotIndex]?.end ?? 0) -
                                (segments[activeShotIndex]?.start ?? 0),
                            )}
                          </p>
                        </div>
                        {selectedBoundary ? (
                          <div className="rounded-full border px-3 py-1.5 shadow-[var(--shadow-md)] backdrop-blur-xl"
                            style={{
                              borderColor: `color-mix(in oklch, ${getSplitSourceColor(selectedBoundary.source)} 42%, transparent)`,
                              backgroundColor: `color-mix(in oklch, ${getSplitSourceColor(selectedBoundary.source)} 16%, transparent)`,
                            }}
                          >
                            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                              Selected Cut
                            </p>
                            <p className="mt-1 font-mono text-xs text-[var(--color-text-primary)]">
                              {formatTimecode(selectedBoundary.time)} · {formatConfidence(selectedBoundary.confidence)}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="absolute inset-x-[var(--space-4)] bottom-[var(--space-4)] z-20 flex flex-wrap items-center justify-between gap-[var(--space-3)] rounded-[18px] border border-[color:color-mix(in_oklch,var(--color-border-default)_72%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_72%,transparent)] px-[var(--space-4)] py-[var(--space-3)] shadow-[var(--shadow-lg)] backdrop-blur-xl">
                        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                          <Button
                            onClick={() => void togglePlayback()}
                            className="rounded-full px-4"
                          >
                            {isPlaying ? <Pause /> : <Play />}
                            {isPlaying ? "Pause" : "Play"}
                          </Button>
                          <button
                            type="button"
                            onClick={() => jumpToSplit("previous")}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] px-4 text-[var(--color-text-secondary)]",
                            )}
                          >
                            <SkipBack />
                            Prev Cut
                          </button>
                          <button
                            type="button"
                            onClick={() => jumpToSplit("next")}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] px-4 text-[var(--color-text-secondary)]",
                            )}
                          >
                            <SkipForward />
                            Next Cut
                          </button>
                          <button
                            type="button"
                            onClick={splitAtCurrentTime}
                            className={cn(
                              buttonVariants({ size: "sm" }),
                              "rounded-full px-4 shadow-[var(--shadow-glow)]",
                            )}
                          >
                            <ScissorsLineDashed />
                            Split Here
                          </button>
                        </div>

                        <div className="hidden flex-wrap items-center gap-[var(--space-2)] xl:flex">
                          {SHORTCUT_HINTS.map((hint) => (
                            <span
                              key={hint}
                              className="rounded-full border border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_52%,transparent)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]"
                            >
                              {hint}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <section className="flex h-14 flex-none flex-col justify-center rounded-[20px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_82%,transparent)] px-[var(--space-3)] py-[var(--space-2)]">
                    <div
                      ref={timelineRef}
                      onPointerDown={handleTimelinePointerDown}
                      onPointerMove={handleTimelinePointerMove}
                      onPointerUp={handleTimelinePointerUp}
                      onPointerCancel={handleTimelinePointerCancel}
                      className="relative h-full w-full cursor-pointer rounded-[14px] border border-[color:color-mix(in_oklch,var(--color-border-default)_58%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_80%,transparent)] px-1 transition-colors hover:border-[color:color-mix(in_oklch,var(--color-accent-base)_60%,transparent)]"
                    >
                      {segments.map((segment, index) => {
                        const left = `${(segment.start / Math.max(effectiveDuration, 0.001)) * 100}%`;
                        const width = `${((segment.end - segment.start) / Math.max(effectiveDuration, 0.001)) * 100}%`;

                        return (
                          <motion.div
                            key={segment.id}
                            layout
                            className="absolute inset-y-1 rounded-[10px]"
                            style={{
                              left,
                              width,
                              background: TIMELINE_SEGMENT_BACKGROUNDS[
                                index % TIMELINE_SEGMENT_BACKGROUNDS.length
                              ],
                            }}
                          />
                        );
                      })}

                      {timelineSelection && timelineSelectionMetrics ? (
                        <motion.div
                          key={timelineSelection.id}
                          initial={{ opacity: 0.35 }}
                          animate={{
                            opacity:
                              timelineSelection.status === "detecting"
                                ? [0.45, 0.82, 0.45]
                                : timelineSelection.status === "success"
                                  ? 0.86
                                  : 0.72,
                            scaleY:
                              timelineSelection.status === "success"
                                ? [1, 1.06, 1]
                                : 1,
                          }}
                          transition={{
                            duration: timelineSelection.status === "detecting" ? 1 : 0.28,
                            repeat: timelineSelection.status === "detecting" ? Infinity : 0,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="pointer-events-none absolute inset-y-1 z-20 overflow-hidden rounded-[10px] border"
                          style={{
                            left: timelineSelectionMetrics.left,
                            width: timelineSelectionMetrics.width,
                            background:
                              timelineSelection.status === "empty" ||
                              timelineSelection.status === "error"
                                ? "linear-gradient(135deg, color-mix(in oklch, var(--color-status-error) 28%, transparent), color-mix(in oklch, var(--color-overlay-badge) 18%, transparent))"
                                : timelineSelection.status === "success"
                                  ? "linear-gradient(135deg, color-mix(in oklch, var(--color-status-verified) 26%, transparent), color-mix(in oklch, var(--color-accent-base) 16%, transparent))"
                                  : "linear-gradient(135deg, color-mix(in oklch, var(--color-overlay-arrow) 28%, transparent), color-mix(in oklch, var(--color-overlay-trajectory) 16%, transparent))",
                            borderColor:
                              timelineSelection.status === "empty" ||
                              timelineSelection.status === "error"
                                ? "color-mix(in oklch, var(--color-status-error) 58%, transparent)"
                                : timelineSelection.status === "success"
                                  ? "color-mix(in oklch, var(--color-status-verified) 56%, transparent)"
                                  : "color-mix(in oklch, var(--color-overlay-arrow) 62%, transparent)",
                            boxShadow:
                              timelineSelection.status === "detecting"
                                ? "0 0 0 1px color-mix(in oklch, var(--color-overlay-arrow) 28%, transparent), 0 0 24px color-mix(in oklch, var(--color-overlay-arrow) 22%, transparent)"
                                : "0 0 18px color-mix(in oklch, var(--color-overlay-arrow) 14%, transparent)",
                          }}
                        >
                          {timelineSelection.status === "detecting" ? (
                            <motion.div
                              aria-hidden="true"
                              className="absolute inset-0"
                              animate={{ x: ["-30%", "100%"] }}
                              transition={{
                                duration: 1.05,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                              style={{
                                background:
                                  "linear-gradient(90deg, transparent 0%, color-mix(in oklch, var(--color-neutral-50) 16%, transparent) 45%, transparent 100%)",
                              }}
                            />
                          ) : null}

                          {timelineSelection.message ? (
                            <div className="absolute inset-x-2 top-1.5 flex items-center justify-between gap-2">
                              <span className="rounded-full border border-[color:color-mix(in_oklch,var(--color-surface-primary)_36%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_56%,transparent)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] backdrop-blur">
                                {timelineSelection.message}
                              </span>
                              {timelineSelection.status === "detecting" ? (
                                <LoaderCircle className="size-3.5 animate-spin text-[var(--color-text-primary)]" />
                              ) : null}
                            </div>
                          ) : null}
                        </motion.div>
                      ) : null}

                      {boundaries.map((boundary) => {
                        const left = `${(boundary.time / Math.max(effectiveDuration, 0.001)) * 100}%`;
                        const isSelected = selectedBoundaryId === boundary.id;
                        const isDetected = detectedBoundaryIds.includes(boundary.id);
                        const isNudging = nudgeFrameOffset?.id === boundary.id;
                        const sourceColor = getSplitSourceColor(boundary.source);

                        return (
                          <motion.button
                            key={boundary.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              selectBoundary(boundary, { cardId: boundary.id });
                              seekTo(boundary.time);
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                            className="absolute inset-y-0 z-20 w-12 -translate-x-1/2"
                            style={{ left }}
                            initial={false}
                            animate={
                              isDetected
                                ? { y: [-12, 0], scale: [0.84, 1.16, 1] }
                                : isNudging
                                  ? { y: [0, -4, 0], scale: [1, 1.08, 1] }
                                  : { y: 0, scale: 1 }
                            }
                            transition={{
                              duration: isDetected || isNudging ? 0.42 : 0.2,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            aria-label={`Select split ${boundary.label} at ${formatTimecode(boundary.time)}`}
                          >
                            <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
                              <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                className="rounded-full border px-2.5 py-1 font-mono text-[11px] leading-none backdrop-blur-xl"
                                style={{
                                  color: sourceColor,
                                  backgroundColor: `color-mix(in oklch, ${sourceColor} 18%, transparent)`,
                                  borderColor: `color-mix(in oklch, ${sourceColor} 42%, transparent)`,
                                  boxShadow: `0 0 18px color-mix(in oklch, ${sourceColor} 18%, transparent)`,
                                }}
                                title={getSplitSourceLabel(boundary.source)}
                              >
                                {formatConfidence(boundary.confidence)}
                              </motion.div>

                              <AnimatePresence>
                                {isNudging ? (
                                  <motion.div
                                    initial={{ opacity: 0, y: 8, scale: 0.94 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                    className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_82%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_78%,transparent)] px-2 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] shadow-[var(--shadow-md)] backdrop-blur-xl"
                                  >
                                    {formatNudgeFrames(nudgeFrameOffset.frames)}
                                  </motion.div>
                                ) : null}
                              </AnimatePresence>
                            </div>

                            <span
                              className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full transition-all"
                              style={{
                                backgroundColor: sourceColor,
                                boxShadow: isSelected
                                  ? `0 0 0 1px color-mix(in oklch, ${sourceColor} 36%, transparent), 0 0 22px color-mix(in oklch, ${sourceColor} 42%, transparent)`
                                  : isDetected
                                    ? `0 0 0 1px color-mix(in oklch, ${sourceColor} 36%, transparent), 0 0 22px color-mix(in oklch, ${sourceColor} 28%, transparent)`
                                    : `0 0 14px color-mix(in oklch, ${sourceColor} 34%, transparent)`,
                              }}
                            />
                          </motion.button>
                        );
                      })}

                      <AnimatePresence>
                        {cutPreview ? (
                          <motion.button
                            type="button"
                            initial={{ opacity: 0, y: 16, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute bottom-[calc(100%+12px)] z-30 w-[min(296px,calc(100vw-48px))] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[color:color-mix(in_oklch,var(--color-border-default)_82%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_94%,transparent)] p-3 text-left shadow-[var(--shadow-xl)] backdrop-blur-xl"
                            style={{ left: cutPreviewLeft }}
                            onClick={() => setCutPreview(null)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
                                  {getSplitSourceLabel(cutPreview.source)}
                                </p>
                                <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                                  {formatTimecode(cutPreview.time)}
                                </p>
                              </div>
                              <div
                                className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)]"
                                style={{
                                  color: getSplitSourceColor(cutPreview.source),
                                  borderColor: `color-mix(in oklch, ${getSplitSourceColor(cutPreview.source)} 38%, transparent)`,
                                  backgroundColor: `color-mix(in oklch, ${getSplitSourceColor(cutPreview.source)} 12%, transparent)`,
                                }}
                              >
                                {formatConfidence(cutPreview.confidence)}
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <div>
                                <p className="mb-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                                  Before
                                </p>
                                {/* Data URLs come from local canvas captures and should bypass Next image optimization. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={cutPreview.beforeFrame}
                                  alt="Frame before detected cut"
                                  className="aspect-video w-full rounded-[12px] border border-[var(--color-border-subtle)] object-cover"
                                />
                              </div>
                              <div>
                                <p className="mb-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                                  After
                                </p>
                                {/* Data URLs come from local canvas captures and should bypass Next image optimization. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={cutPreview.afterFrame}
                                  alt="Frame after detected cut"
                                  className="aspect-video w-full rounded-[12px] border border-[var(--color-border-subtle)] object-cover"
                                />
                              </div>
                            </div>
                          </motion.button>
                        ) : null}
                      </AnimatePresence>

                      <div
                        className="absolute inset-y-0 z-10 w-5 -translate-x-1/2"
                        style={{
                          left: `${(currentTime / Math.max(effectiveDuration, 0.001)) * 100}%`,
                        }}
                      >
                        <div className="absolute left-1/2 top-1 size-3 -translate-x-1/2 rounded-full border border-[var(--color-surface-primary)] bg-[var(--color-text-primary)] shadow-[0_0_18px_color-mix(in_oklch,var(--color-text-primary)_35%,transparent)]" />
                        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--color-text-primary)]" />
                      </div>
                    </div>
                  </section>

                  <section className="flex h-32 flex-none items-stretch gap-3 overflow-x-auto overflow-y-hidden px-2 py-2 scene-scrollbar-thin">
                    {segments.map((segment, index) => {
                      const isActive = index === activeShotIndex;
                      const isSelected = selectedCardId === segment.id;
                      const isHighlighted = isActive || isSelected;
                      const removeBoundaryId =
                        index === 0 ? segments[1]?.id ?? null : segment.id;
                      const tagState = segmentTags[segment.id];
                      const tagLines = getTagDisplayLines(tagState?.tags ?? []);
                      const rightBoundaryMeta = segments[index + 1]
                        ? {
                            source: segments[index + 1].splitSource,
                            confidence: segments[index + 1].confidence,
                          }
                        : {
                            source: segment.splitSource,
                            confidence: segment.confidence,
                          };

                      return (
                        <motion.button
                          key={segment.id}
                          type="button"
                          ref={(node) => {
                            if (node) {
                              cardRefs.current.set(segment.id, node);
                            } else {
                              cardRefs.current.delete(segment.id);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => handleSegmentCardSelect(segment, index)}
                          onKeyDown={(event) => handleCardKeyDown(event, segment)}
                          aria-label={`Jump to shot ${index + 1}`}
                          aria-pressed={isSelected}
                          className="group/card relative flex w-52 shrink-0 cursor-pointer gap-2 rounded-xl border bg-[var(--color-surface-secondary)] p-2 text-left transition-colors"
                          style={{
                            borderColor: isHighlighted
                              ? "var(--color-border-strong)"
                              : "var(--color-border-default)",
                          }}
                        >
                          {/* Thumbnail */}
                          <div className="relative h-full w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--color-surface-tertiary)]">
                            {segment.thumbnail ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={segment.thumbnail}
                                alt={`Shot ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="scene-skeleton h-full w-full" />
                            )}
                          </div>

                          {/* Info */}
                          <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                            <div>
                              <p className="font-mono text-xs font-bold text-[var(--color-text-primary)]">
                                #{index + 1}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">
                                {formatDuration(segment.end - segment.start)}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="truncate font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)]">
                                {getSplitSourceShortLabel(rightBoundaryMeta.source)}
                              </p>
                              {tagState?.status === "loading" ? (
                                <div className="flex items-center gap-1 text-[var(--color-text-tertiary)]">
                                  <LoaderCircle className="size-3 animate-spin" />
                                  <span className="truncate text-[10px]">Analyzing frame...</span>
                                </div>
                              ) : tagLines.length > 0 ? (
                                <div className="space-y-0.5">
                                  {tagLines.map((line) => (
                                    <p
                                      key={`${segment.id}-${line}`}
                                      className="truncate text-[10px] leading-4 text-[var(--color-text-tertiary)]"
                                    >
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              ) : tagState?.status === "error" ? (
                                <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">
                                  Tags unavailable
                                </p>
                              ) : (
                                <p className="truncate text-[10px] text-[var(--color-text-tertiary)]">
                                  Waiting for frame...
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Remove button — hover only, not on first card */}
                          {index > 0 && removeBoundaryId ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeBoundary(removeBoundaryId);
                              }}
                              className="absolute -right-1 -top-1 z-20 flex size-5 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] text-[var(--color-text-secondary)] opacity-0 transition-opacity group-hover/card:opacity-100"
                              aria-label={`Remove split near shot ${index + 1}`}
                            >
                              <X className="size-3" />
                            </button>
                          ) : null}
                        </motion.button>
                      );
                    })}
                  </section>
                </section>
              </div>
            </LayoutGroup>

            <AnimatePresence>
              {exportSummary ? (
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.98 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute bottom-8 right-8 z-50 w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-[22px] border border-[color:color-mix(in_oklch,var(--color-status-verified)_36%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_90%,transparent)] p-5 shadow-[var(--shadow-xl)] backdrop-blur-xl"
                >
                  <motion.div
                    aria-hidden="true"
                    className="absolute inset-0"
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: 1 }}
                    style={{
                      background:
                        "radial-gradient(circle at top left, color-mix(in oklch, var(--color-status-verified) 16%, transparent) 0%, transparent 36%), radial-gradient(circle at 85% 10%, color-mix(in oklch, var(--color-accent-base) 12%, transparent) 0%, transparent 30%)",
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-[color:color-mix(in_oklch,var(--color-status-verified)_18%,transparent)] p-3 text-[var(--color-status-verified)]">
                        <WandSparkles className="size-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          Splits approved
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {exportSummary.shotCount} shots confirmed,{" "}
                          {exportSummary.added} added, {exportSummary.removed} removed.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      {Array.from({ length: 10 }).map((_, index) => (
                        <motion.span
                          key={index}
                          className="h-2 flex-1 rounded-full"
                          initial={{ scaleY: 0.3, opacity: 0.4 }}
                          animate={{
                            scaleY: [0.3, 1, 0.45],
                            opacity: [0.4, 1, 0.6],
                          }}
                          transition={{
                            delay: index * 0.03,
                            duration: 0.55,
                            repeat: 1,
                            repeatType: "reverse",
                          }}
                          style={{
                            background:
                              index % 2 === 0
                                ? "var(--color-status-verified)"
                                : "var(--color-accent-base)",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <video
              ref={captureVideoRef}
              src={videoUrl ?? undefined}
              preload="metadata"
              muted
              playsInline
              className="hidden"
            />
            <canvas ref={captureCanvasRef} className="hidden" />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => void handleVideoInputChange(event)}
            />
            <input
              ref={splitsInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => void handleSplitsInputChange(event)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
