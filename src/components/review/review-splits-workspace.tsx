"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Check,
  FileJson,
  Film,
  Pause,
  Play,
  ScissorsLineDashed,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReviewSplit = {
  start: number;
  end: number;
  thumbnail_time: number;
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
};

type ExportSummary = {
  shotCount: number;
  added: number;
  removed: number;
};

const SPLIT_EPSILON = 0.15;
const SEEK_STEP = 1;
const SEEK_BIG_STEP = 5;
const TIMELINE_SEGMENT_BACKGROUNDS = [
  "linear-gradient(135deg, color-mix(in oklch, var(--color-accent-base) 24%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 92%, transparent))",
  "linear-gradient(135deg, color-mix(in oklch, var(--color-signal-violet) 22%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 88%, transparent))",
  "linear-gradient(135deg, color-mix(in oklch, var(--color-overlay-badge) 20%, transparent), color-mix(in oklch, var(--color-surface-tertiary) 88%, transparent))",
] as const;
const SHORTCUT_HINTS = [
  "Space Play/Pause",
  "S Split",
  "J/L Prev/Next Cut",
  "Delete Remove",
  "Enter Approve",
] as const;

function createSegment(
  start: number,
  end: number,
  thumbnailTime?: number,
  thumbnail: string | null = null,
  thumbnailDirty = true,
): ShotSegment {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    start,
    end,
    thumbnailTime: thumbnailTime ?? start + Math.max(end - start, 0) / 2,
    thumbnail,
    thumbnailDirty,
  };
}

function clampTime(value: number, max: number) {
  return Math.min(Math.max(value, 0), max);
}

function roundTime(value: number) {
  return Number(value.toFixed(3));
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

function boundaryKey(value: number) {
  return roundTime(value).toFixed(3);
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

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      Number.isNaN(thumbnailTime)
    ) {
      throw new Error(`Split ${index + 1} is missing numeric time values.`);
    }

    return {
      start,
      end,
      thumbnail_time: thumbnailTime,
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
    splits: segments.map((segment) => ({
      start: roundTime(segment.start),
      end: roundTime(segment.end),
      thumbnail_time: roundTime(segment.thumbnailTime),
    })),
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
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const thumbnailPendingRef = useRef(new Set<string>());
  const thumbnailLoopActiveRef = useRef(false);
  const segmentsRef = useRef<ShotSegment[]>([]);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [reviewPayload, setReviewPayload] = useState<ReviewPayload | null>(null);
  const [initialSegments, setInitialSegments] = useState<ShotSegment[]>([]);
  const [segments, setSegments] = useState<ShotSegment[]>([]);
  const [pasteValue, setPasteValue] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedBoundaryId, setSelectedBoundaryId] = useState<string | null>(
    null,
  );
  const [lastAddedSegmentId, setLastAddedSegmentId] = useState<string | null>(
    null,
  );
  const [dropTarget, setDropTarget] = useState<"video" | "splits" | null>(null);
  const [loadingSplitsFromUrl, setLoadingSplitsFromUrl] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<ExportSummary | null>(null);

  const effectiveDuration = Math.max(
    videoDuration,
    reviewPayload?.total_duration ?? 0,
    segments.at(-1)?.end ?? 0,
  );

  segmentsRef.current = segments;

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
      })),
    [segments],
  );

  const workspaceReady = Boolean(videoUrl && reviewPayload && effectiveDuration >= 0);
  const summary = computeExportSummary(initialSegments, segments);

  useEffect(() => {
    if (!videoFile) {
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
    if (!workspaceReady) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    let frameRequest = 0;

    const syncTime = () => {
      setCurrentTime(video.currentTime || 0);
    };

    const tick = () => {
      syncTime();
      if (!video.paused && !video.ended) {
        frameRequest = window.requestAnimationFrame(tick);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      frameRequest = window.requestAnimationFrame(tick);
    };

    const handlePause = () => {
      setIsPlaying(false);
      window.cancelAnimationFrame(frameRequest);
      syncTime();
    };

    const handleLoadedMetadata = () => {
      setVideoDuration(video.duration || 0);
      syncTime();
    };

    handleLoadedMetadata();

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("seeking", syncTime);
    video.addEventListener("seeked", syncTime);
    video.addEventListener("timeupdate", syncTime);
    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      window.cancelAnimationFrame(frameRequest);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("seeking", syncTime);
      video.removeEventListener("seeked", syncTime);
      video.removeEventListener("timeupdate", syncTime);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [workspaceReady]);

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
        seekBy(event.shiftKey ? -SEEK_BIG_STEP : -SEEK_STEP);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
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
            break;
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
    const segmentIndex = segments.findIndex(
      (segment) =>
        splitTime > segment.start + SPLIT_EPSILON &&
        splitTime < segment.end - SPLIT_EPSILON,
    );

    if (segmentIndex === -1) {
      return;
    }

    const snapshot = captureCurrentFrame();

    setSegments((currentSegments) => {
      const segment = currentSegments[segmentIndex];
      const left = createSegment(
        segment.start,
        splitTime,
        segment.start + (splitTime - segment.start) / 2,
        segment.thumbnail,
        true,
      );
      const right = createSegment(
        splitTime,
        segment.end,
        splitTime + (segment.end - splitTime) / 2,
        snapshot,
        snapshot ? false : true,
      );

      const nextSegments = [...currentSegments];
      nextSegments.splice(segmentIndex, 1, left, right);
      setSelectedBoundaryId(right.id);
      setLastAddedSegmentId(right.id);
      return nextSegments;
    });
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
      );

      const nextSegments = [...currentSegments];
      nextSegments.splice(index - 1, 2, merged);

      const nextSelected =
        nextSegments[index]?.id ?? nextSegments[index - 1]?.id ?? null;
      setSelectedBoundaryId(nextSelected);
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
      setReviewPayload(parsedPayload);
      setInitialSegments(builtSegments);
      setSegments(builtSegments);
      setSelectedBoundaryId(null);
      setCurrentTime(0);
      setExportSummary(null);
      setErrorMessage(null);
    });
  }

  async function handleVideoSelection(file: File | null) {
    if (!file) {
      return;
    }

    setVideoFile(file);
    setVideoDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    setExportSummary(null);
    setErrorMessage(null);
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

  function handleTimelineClick(event: ReactMouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    seekTo(ratio * effectiveDuration);
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at top left, color-mix(in oklch, var(--color-accent-base) 18%, transparent) 0%, transparent 34%), radial-gradient(circle at 85% 18%, color-mix(in oklch, var(--color-signal-violet) 14%, transparent) 0%, transparent 30%), radial-gradient(circle at 50% 100%, color-mix(in oklch, var(--color-status-verified) 10%, transparent) 0%, transparent 28%)",
        }}
      />

      {!workspaceReady ? (
        <div className="relative flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
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
        </div>
      ) : (
        <div className="relative flex min-h-screen flex-col p-3 sm:p-4">
          <LayoutGroup>
            <div
              className="grid min-h-[calc(100vh-24px)] flex-1 gap-3 rounded-[28px] border p-3 shadow-[var(--shadow-xl)] sm:p-4"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 96%, transparent), color-mix(in oklch, var(--color-surface-primary) 100%, transparent))",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                gridTemplateRows: "minmax(280px, 40vh) 84px minmax(280px, 1fr)",
              }}
            >
              <section className="relative overflow-hidden rounded-[22px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_72%,transparent)]">
                <div className="absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_72%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_56%,transparent)] px-4 py-2 shadow-[var(--shadow-md)] backdrop-blur-xl">
                    <p className="font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                      {videoFile?.name ?? reviewPayload?.filename}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                      {segments.length} shots · {formatTimecode(currentTime)} /{" "}
                      {formatTimecode(effectiveDuration)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] px-4 text-[var(--color-text-secondary)]",
                      )}
                    >
                      <Upload />
                      Replace Video
                    </button>
                    <button
                      type="button"
                      onClick={() => splitsInputRef.current?.click()}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "rounded-full border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_60%,transparent)] px-4 text-[var(--color-text-secondary)]",
                      )}
                    >
                      <FileJson />
                      Replace Splits
                    </button>
                  </div>
                </div>

                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  controls={false}
                  preload="metadata"
                  className="h-full w-full object-contain"
                />

                <div className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-[linear-gradient(180deg,transparent,color-mix(in_oklch,var(--color-surface-primary)_88%,transparent))] p-4">
                  <div className="flex flex-wrap items-center gap-2">
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

                  <div className="flex flex-wrap items-center gap-2">
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
              </section>

              <section className="relative overflow-hidden rounded-[20px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_82%,transparent)] px-3 py-3">
                <div
                  onClick={(event) => handleTimelineClick(event)}
                  className="relative h-full w-full cursor-pointer rounded-[16px] border border-[color:color-mix(in_oklch,var(--color-border-default)_58%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_80%,transparent)] px-1 transition-colors hover:border-[color:color-mix(in_oklch,var(--color-accent-base)_60%,transparent)]"
                >
                  {segments.map((segment, index) => {
                    const left = `${(segment.start / Math.max(effectiveDuration, 0.001)) * 100}%`;
                    const width = `${((segment.end - segment.start) / Math.max(effectiveDuration, 0.001)) * 100}%`;

                    return (
                      <motion.div
                        key={segment.id}
                        layout
                        className="absolute inset-y-1 rounded-[12px]"
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

                  {boundaries.map((boundary) => {
                    const left = `${(boundary.time / Math.max(effectiveDuration, 0.001)) * 100}%`;
                    const isSelected = selectedBoundaryId === boundary.id;

                    return (
                      <button
                        key={boundary.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedBoundaryId(boundary.id);
                          seekTo(boundary.time);
                        }}
                        className="absolute inset-y-0 w-4 -translate-x-1/2"
                        style={{ left }}
                        aria-label={`Select split ${boundary.label} at ${formatTimecode(boundary.time)}`}
                      >
                        <span
                          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full transition-all"
                          style={{
                            backgroundColor: isSelected
                              ? "var(--color-overlay-badge)"
                              : "var(--color-overlay-arrow)",
                            boxShadow: isSelected
                              ? "0 0 0 1px color-mix(in oklch, var(--color-overlay-badge) 32%, transparent), 0 0 18px color-mix(in oklch, var(--color-overlay-badge) 42%, transparent)"
                              : "0 0 14px color-mix(in oklch, var(--color-overlay-arrow) 34%, transparent)",
                          }}
                        />
                      </button>
                    );
                  })}

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

              <section className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                <div className="min-h-0 overflow-hidden rounded-[22px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_76%,transparent)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                        Filmstrip
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-primary)]">
                        Click a shot to jump. Remove with the cut button or
                        `Delete`.
                      </p>
                    </div>
                    <div className="rounded-full border border-[var(--color-border-default)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                      {summary.shotCount} shots
                    </div>
                  </div>

                  <div className="flex h-[calc(100%-68px)] gap-3 overflow-x-auto overflow-y-hidden px-4 py-4">
                    <AnimatePresence initial={false}>
                      {segments.map((segment, index) => {
                        const isActive = index === activeShotIndex;
                        const removeBoundaryId =
                          index === 0 ? segments[1]?.id ?? null : segment.id;

                        return (
                          <motion.div
                            key={segment.id}
                            layout
                            initial={{ opacity: 0, y: 28, scale: 0.98 }}
                            animate={{
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              borderColor: isActive
                                ? "color-mix(in oklch, var(--color-accent-light) 86%, transparent)"
                                : "color-mix(in oklch, var(--color-border-default) 82%, transparent)",
                              boxShadow:
                                lastAddedSegmentId === segment.id
                                  ? "0 0 0 1px color-mix(in oklch, var(--color-status-verified) 42%, transparent), 0 0 34px color-mix(in oklch, var(--color-status-verified) 24%, transparent)"
                                  : isActive
                                    ? "0 0 0 1px color-mix(in oklch, var(--color-accent-base) 38%, transparent), 0 10px 30px color-mix(in oklch, var(--color-accent-base) 16%, transparent)"
                                    : "var(--shadow-md)",
                            }}
                            exit={{ opacity: 0, y: -20, scale: 0.98 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="group relative flex h-full min-w-[240px] max-w-[240px] flex-col overflow-hidden rounded-[20px] border text-left"
                            style={{
                              background:
                                "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 96%, transparent), color-mix(in oklch, var(--color-surface-primary) 100%, transparent))",
                            }}
                          >
                            <button
                              ref={(node) => {
                                if (node) {
                                  cardRefs.current.set(segment.id, node);
                                } else {
                                  cardRefs.current.delete(segment.id);
                                }
                              }}
                              type="button"
                              onClick={() => {
                                seekTo(segment.start);
                                setSelectedBoundaryId(
                                  index === 0 ? segments[1]?.id ?? null : segment.id,
                                );
                              }}
                              onKeyDown={(event) => handleCardKeyDown(event, segment)}
                              className="absolute inset-0 z-10"
                              aria-label={`Jump to shot ${index + 1}`}
                            />
                            <div className="relative aspect-video overflow-hidden bg-[var(--color-surface-tertiary)]">
                              {segment.thumbnail ? (
                                // Data URLs come from local canvas captures and should bypass Next image optimization.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={segment.thumbnail}
                                  alt={`Shot ${index + 1} thumbnail`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="scene-skeleton h-full w-full" />
                              )}

                              <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 p-3">
                                <div className="rounded-full border border-[color:color-mix(in_oklch,var(--color-border-default)_70%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_64%,transparent)] px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] backdrop-blur">
                                  #{index + 1}
                                </div>
                                <button
                                  type="button"
                                  disabled={!removeBoundaryId}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (removeBoundaryId) {
                                      removeBoundary(removeBoundaryId);
                                    }
                                  }}
                                  className="rounded-full border border-[color:color-mix(in_oklch,var(--color-status-error)_36%,transparent)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_64%,transparent)] p-2 text-[var(--color-text-secondary)] backdrop-blur transition-colors hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Remove split near shot ${index + 1}`}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>

                              {isActive ? (
                                <motion.div
                                  layoutId="active-shot-glow"
                                  className="absolute inset-0"
                                  style={{
                                    boxShadow:
                                      "inset 0 0 0 1px color-mix(in oklch, var(--color-accent-light) 82%, transparent), inset 0 0 80px color-mix(in oklch, var(--color-accent-base) 10%, transparent)",
                                  }}
                                />
                              ) : null}
                            </div>

                            <div className="flex flex-1 flex-col gap-3 p-4">
                              <div>
                                <p className="font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                                  {formatTimecode(segment.start)} to{" "}
                                  {formatTimecode(segment.end)}
                                </p>
                                <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                                  Duration {formatDuration(segment.end - segment.start)}
                                </p>
                              </div>
                              <div className="mt-auto rounded-[16px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_56%,transparent)] px-3 py-2 font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                                {index === 0
                                  ? "Remove merges forward"
                                  : "Remove merges backward"}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="flex min-h-0 flex-col justify-between rounded-[22px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-primary)_76%,transparent)] p-5">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
                      Review Status
                    </p>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[18px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_72%,transparent)] p-4">
                        <p className="text-sm text-[var(--color-text-secondary)]">
                          Current cut count
                        </p>
                        <p className="mt-2 text-3xl font-semibold">
                          {summary.shotCount}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[18px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_72%,transparent)] p-4">
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            Added
                          </p>
                          <p className="mt-2 font-mono text-2xl text-[var(--color-status-verified)]">
                            +{summary.added}
                          </p>
                        </div>
                        <div className="rounded-[18px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_72%,transparent)] p-4">
                          <p className="text-sm text-[var(--color-text-secondary)]">
                            Removed
                          </p>
                          <p className="mt-2 font-mono text-2xl text-[var(--color-overlay-badge)]">
                            -{summary.removed}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div className="rounded-[18px] border border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_72%,transparent)] p-4">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Selected cut
                      </p>
                      <p className="mt-2 font-mono text-sm text-[var(--color-text-primary)]">
                        {selectedBoundaryId
                          ? formatTimecode(
                              boundaries.find((boundary) => boundary.id === selectedBoundaryId)?.time ?? 0,
                            )
                          : "None"}
                      </p>
                    </div>

                    <Button
                      onClick={approveSplits}
                      className="h-12 w-full rounded-[18px] bg-[var(--color-status-verified)] text-[var(--color-surface-primary)] shadow-[0_0_28px_color-mix(in_oklch,var(--color-status-verified)_28%,transparent)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--color-status-verified)]"
                    >
                      <Check />
                      Approve Splits
                    </Button>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Downloads corrected JSON immediately so the pipeline can
                      continue with `--splits`.
                    </p>
                  </div>
                </div>
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
        </div>
      )}
    </div>
  );
}
