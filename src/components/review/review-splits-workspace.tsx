"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import {
  type DragEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleHelp, Film, LoaderCircle, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
type SplitSource = "auto" | "detected" | "manual";
type ReviewSplit = {
  id: string;
  start: number;
  end: number;
  source: SplitSource;
  confidence: number | null;
};
type DetectShotsResponse = {
  splits?: Array<{ start?: unknown; end?: unknown; duration?: unknown }>;
  videoPath?: string;
  error?: string;
};
type DetectSplitResponse = {
  cuts?: Array<{ time?: unknown; confidence?: unknown }>;
  error?: string;
};
type ProcessSceneResponse = {
  success?: boolean;
  filmId?: string;
  shotCount?: number;
  error?: string;
};
type FilmFormState = {
  filmTitle: string;
  director: string;
  year: string;
};
type ApprovalStage = "idle" | "metadata" | "processing" | "success";

const DEFAULT_FPS = 24;
const DRAG_THRESHOLD = 5;
const PROCESSING_STEPS = [
  "Extracting clips...",
  "Classifying with Gemini...",
  "Uploading to storage...",
  "Saving to database...",
] as const;
const MARKER_COLORS: Record<SplitSource, string> = {
  auto: "var(--color-overlay-motion)",
  detected: "var(--color-overlay-badge)",
  manual: "var(--color-overlay-info)",
};
function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function roundTime(value: number) {
  return Number(value.toFixed(3));
}
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
function formatClock(value: number) {
  const safe = Math.max(value, 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
function formatConfidence(confidence: number | null) {
  return confidence === null ? "MAN" : `${Math.round(confidence * 100)}%`;
}
function normalizeSegments(
  segments: Array<Pick<ReviewSplit, "start" | "end" | "source" | "confidence">>,
  duration: number,
) {
  const sorted = segments
    .map((segment) => ({
      ...segment,
      start: roundTime(clamp(Number(segment.start), 0, duration)),
      end: roundTime(clamp(Number(segment.end), 0, duration)),
    }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  return sorted.map((segment, index) => {
    const nextStart = sorted[index + 1]?.start;
    return {
      id: createId(),
      start: segment.start,
      end: roundTime(nextStart ?? segment.end),
      source: segment.source,
      confidence: segment.confidence,
    };
  });
}
function getCuts(splits: ReviewSplit[]) {
  return splits.slice(0, -1).map((split) => ({
    id: split.id,
    time: split.end,
    source: split.source,
    confidence: split.confidence,
  }));
}
function rebuildFromCuts(
  cuts: Array<{ time: number; source: SplitSource; confidence: number | null }>,
  duration: number,
) {
  const deduped = cuts
    .map((cut) => ({
      ...cut,
      time: roundTime(clamp(cut.time, 0, duration)),
    }))
    .filter((cut) => cut.time > 0 && cut.time < duration)
    .sort((a, b) => a.time - b.time)
    .reduce<Array<{ time: number; source: SplitSource; confidence: number | null }>>(
      (acc, cut) => {
        const previous = acc.at(-1);
        if (previous && Math.abs(previous.time - cut.time) < 0.05) {
          if ((cut.confidence ?? 0) >= (previous.confidence ?? 0)) {
            acc[acc.length - 1] = cut;
          }
          return acc;
        }
        acc.push(cut);
        return acc;
      },
      [],
    );

  const splits: ReviewSplit[] = [];
  let cursor = 0;
  for (const cut of deduped) {
    splits.push({
      id: createId(),
      start: roundTime(cursor),
      end: cut.time,
      source: cut.source,
      confidence: cut.confidence,
    });
    cursor = cut.time;
  }
  if (duration > cursor) {
    splits.push({
      id: createId(),
      start: roundTime(cursor),
      end: roundTime(duration),
      source: splits.at(-1)?.source ?? "auto",
      confidence: null,
    });
  }
  return splits;
}
function getDurationFromSplits(splits: ReviewSplit[]) {
  return splits.reduce((max, split) => Math.max(max, split.end), 0);
}
async function waitForSeek(video: HTMLVideoElement, time: number) {
  await new Promise<void>((resolve) => {
    video.addEventListener("seeked", () => resolve(), { once: true });
    video.currentTime = time;
  });
}
export function ReviewSplitsWorkspace() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    currentX: number;
    rect: DOMRect;
  } | null>(null);
  const thumbnailRunRef = useRef(0);
  const progressTimerRef = useRef<number | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadedVideoPath, setUploadedVideoPath] = useState<string | null>(null);
  const [splits, setSplits] = useState<ReviewSplit[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSplitId, setSelectedSplitId] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [status, setStatus] = useState("Drop a video to begin");
  const [dragRegion, setDragRegion] = useState<{ start: number; end: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [approvalStage, setApprovalStage] = useState<ApprovalStage>("idle");
  const [filmForm, setFilmForm] = useState<FilmFormState>({
    filmTitle: "",
    director: "",
    year: "",
  });
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [processingStepIndex, setProcessingStepIndex] = useState(0);
  const [successMessage, setSuccessMessage] = useState("");
  const duration = videoDuration || getDurationFromSplits(splits);
  const selectedSplit = splits.find((split) => split.id === selectedSplitId) ?? null;
  const splitCuts = useMemo(() => getCuts(splits), [splits]);
  const activeSplitId =
    splits.find((split) => currentTime >= split.start && currentTime < split.end + 0.001)?.id ??
    splits.at(-1)?.id ??
    null;

  const clearTimers = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  };

  const resetApprovalState = () => {
    clearTimers();
    setApprovalStage("idle");
    setApprovalError(null);
    setProcessingStepIndex(0);
    setSuccessMessage("");
  };

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
      clearTimers();
    };
  }, [videoUrl]);
  useEffect(() => {
    if (!videoUrl || splits.length === 0) {
      setThumbnails(new Map());
      return;
    }
    let cancelled = false;
    const runId = thumbnailRunRef.current + 1;
    thumbnailRunRef.current = runId;
    setThumbnails(new Map());
    const preview = document.createElement("video");
    preview.src = videoUrl;
    preview.muted = true;
    preview.playsInline = true;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const generate = async () => {
      await new Promise<void>((resolve) => {
        if (preview.readyState >= 1) {
          resolve();
          return;
        }
        preview.addEventListener("loadedmetadata", () => resolve(), { once: true });
      });
      canvas.width = preview.videoWidth || 320;
      canvas.height = preview.videoHeight || 180;
      for (const split of splits) {
        if (cancelled || runId !== thumbnailRunRef.current || !context) {
          return;
        }
        try {
          await waitForSeek(preview, clamp(split.start + (split.end - split.start) / 2, 0, preview.duration || 0));
          context.drawImage(preview, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
          setThumbnails((current) => new Map(current).set(split.id, dataUrl));
        } catch {
          // Continue if a thumbnail frame fails.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
    };
    void generate();
    return () => {
      cancelled = true;
      preview.pause();
      preview.removeAttribute("src");
      preview.load();
    };
  }, [splits, videoUrl]);
  const syncFromCuts = (
    cuts: Array<{ time: number; source: SplitSource; confidence: number | null }>,
  ) => {
    setSplits(rebuildFromCuts(cuts, duration));
  };
  const seekTo = (time: number) => {
    const next = clamp(time, 0, duration);
    if (videoRef.current) {
      videoRef.current.currentTime = next;
    }
    setCurrentTime(next);
  };
  const insertSplitAt = (time: number, source: SplitSource, confidence: number | null) => {
    if (time <= 0 || time >= duration) {
      return;
    }
    syncFromCuts(splitCuts.concat({ id: createId(), time, source, confidence }));
    setSelectedSplitId(null);
    setStatus(source === "manual" ? "Added manual split." : "Added detected split.");
  };
  const removeSplit = (splitId: string) => {
    const split = splits.find((item) => item.id === splitId);
    if (!split || split.end >= duration) {
      return;
    }
    syncFromCuts(splitCuts.filter((cut) => cut.id !== splitId));
    setSelectedSplitId(null);
    setStatus("Removed split.");
  };
  const nudgeSelectedSplit = (delta: number) => {
    if (!selectedSplit || selectedSplit.end >= duration) {
      return;
    }
    const nextCuts = splitCuts.map((cut, index) => {
      if (cut.id !== selectedSplit.id) {
        return cut;
      }
      const previous = index > 0 ? splitCuts[index - 1].time : 0;
      const next = index < splitCuts.length - 1 ? splitCuts[index + 1].time : duration;
      return {
        ...cut,
        time: roundTime(clamp(cut.time + delta, previous + 0.05, next - 0.05)),
      };
    });
    syncFromCuts(nextCuts);
    seekTo(selectedSplit.end + delta);
    setStatus("Nudged selected split.");
  };
  const jumpToBoundary = (direction: -1 | 1) => {
    if (splitCuts.length === 0) {
      return;
    }
    const ordered = splitCuts.map((cut) => cut.time);
    const target =
      direction === 1
        ? ordered.find((time) => time > currentTime + 0.01) ?? ordered.at(-1)
        : [...ordered].reverse().find((time) => time < currentTime - 0.01) ?? ordered[0];
    if (typeof target === "number") {
      seekTo(target);
      setSelectedSplitId(splits.find((split) => Math.abs(split.end - target) < 0.05)?.id ?? null);
    }
  };
  const openApprovalModal = () => {
    if (!videoFile || splits.length === 0) {
      return;
    }

    setApprovalError(null);
    setProcessingStepIndex(0);
    setApprovalStage("metadata");
  };

  const submitApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!uploadedVideoPath) {
      setApprovalError("Video path unavailable. Re-upload the source video and try again.");
      return;
    }

    const filmTitle = filmForm.filmTitle.trim();
    const director = filmForm.director.trim();
    const year = Number.parseInt(filmForm.year, 10);

    if (!filmTitle || !director || !Number.isInteger(year)) {
      setApprovalError("Film title, director, and a valid year are required.");
      return;
    }

    clearTimers();
    setApprovalError(null);
    setProcessingStepIndex(0);
    setApprovalStage("processing");
    setStatus("Processing scene...");

    progressTimerRef.current = window.setInterval(() => {
      setProcessingStepIndex((current) => Math.min(current + 1, PROCESSING_STEPS.length - 1));
    }, 1400);

    try {
      const response = await fetch("/api/process-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPath: uploadedVideoPath,
          filmTitle,
          director,
          year,
          splits: splits.map((split) => ({
            start: roundTime(split.start),
            end: roundTime(split.end),
            source: split.source,
            confidence: split.confidence,
          })),
        }),
      });
      const payload = (await response.json()) as ProcessSceneResponse;

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Scene processing failed.");
      }

      clearTimers();
      setProcessingStepIndex(PROCESSING_STEPS.length - 1);
      setApprovalStage("success");
      setSuccessMessage(`Added ${payload.shotCount ?? splits.length} shots from ${filmTitle}`);
      setStatus(`Added ${payload.shotCount ?? splits.length} shots to the archive.`);
      redirectTimerRef.current = window.setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      clearTimers();
      setApprovalStage("metadata");
      setApprovalError(error instanceof Error ? error.message : "Scene processing failed.");
      setStatus(error instanceof Error ? error.message : "Scene processing failed.");
    }
  };
  useEffect(() => {
    const handleKeydown = async (event: KeyboardEvent) => {
      if (!videoUrl || approvalStage !== "idle") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (videoRef.current?.paused) {
          await videoRef.current.play();
        } else {
          videoRef.current?.pause();
        }
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        insertSplitAt(videoRef.current?.currentTime ?? currentTime, "manual", null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedSplit) {
        event.preventDefault();
        removeSplit(selectedSplit.id);
        return;
      }
      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        jumpToBoundary(-1);
        return;
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        jumpToBoundary(1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        openApprovalModal();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        if (selectedSplit && selectedSplit.end < duration) {
          nudgeSelectedSplit(direction * (1 / DEFAULT_FPS));
        } else {
          seekTo(currentTime + direction);
        }
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [approvalStage, currentTime, duration, selectedSplit, videoUrl]);
  const loadVideo = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setStatus("Only video/* files are supported.");
      return;
    }
    resetApprovalState();
    setFilmForm({
      filmTitle: "",
      director: "",
      year: "",
    });
    setIsLoading(true);
    setStatus("Analyzing...");
    setCurrentTime(0);
    setSelectedSplitId(null);
    setSplits([]);
    setThumbnails(new Map());
    setUploadedVideoPath(null);
    setVideoDuration(0);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    try {
      const formData = new FormData();
      formData.append("video", file);
      const response = await fetch("/api/detect-shots", { method: "POST", body: formData });
      const payload = (await response.json()) as DetectShotsResponse;

      if (!response.ok || !payload.videoPath) {
        throw new Error(payload.error || "Shot detection failed.");
      }
      const rawSplits = Array.isArray(payload.splits)
        ? payload.splits
            .map((split) => ({
              start: Number(split.start),
              end: Number(split.end),
              source: "auto" as const,
              confidence: 1,
            }))
            .filter((split) => Number.isFinite(split.start) && Number.isFinite(split.end))
            .filter((split) => split.end > split.start)
        : [];
      setUploadedVideoPath(payload.videoPath);
      setSplits(normalizeSegments(rawSplits, rawSplits.at(-1)?.end ?? 0));
      setStatus("Review detected splits, then approve to save.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Shot detection failed.");
    } finally {
      setIsLoading(false);
    }
  };
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files.item(0);
    if (file) {
      await loadVideo(file);
    }
  };
  const handleTimelinePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!timelineRef.current || duration <= 0 || isLoading) {
      return;
    }
    const rect = timelineRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      currentX: event.clientX,
      rect,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleTimelinePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    drag.currentX = event.clientX;
    if (Math.abs(drag.currentX - drag.startX) < DRAG_THRESHOLD) {
      setDragRegion(null);
      return;
    }
    const start = clamp((Math.min(drag.startX, drag.currentX) - drag.rect.left) / drag.rect.width, 0, 1) * duration;
    const end = clamp((Math.max(drag.startX, drag.currentX) - drag.rect.left) / drag.rect.width, 0, 1) * duration;
    setDragRegion({ start, end });
  };
  const handleTimelinePointerUp = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragRegion(null);
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);

    const movement = Math.abs(drag.currentX - drag.startX);
    const clickRatio = clamp((event.clientX - drag.rect.left) / drag.rect.width, 0, 1);
    const clickTime = clickRatio * duration;
    if (movement < DRAG_THRESHOLD) {
      seekTo(clickTime);
      setSelectedSplitId(
        splits.find((split) => clickTime >= split.start && clickTime < split.end)?.id ?? null,
      );
      return;
    }
    if (!uploadedVideoPath) {
      setStatus("Video path unavailable for drag detection.");
      return;
    }
    const start = clamp((Math.min(drag.startX, drag.currentX) - drag.rect.left) / drag.rect.width, 0, 1) * duration;
    const end = clamp((Math.max(drag.startX, drag.currentX) - drag.rect.left) / drag.rect.width, 0, 1) * duration;
    setIsLoading(true);
    setStatus("Detecting strongest cut...");

    try {
      const response = await fetch("/api/detect-split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: uploadedVideoPath,
          startTime: roundTime(start),
          endTime: roundTime(end),
        }),
      });
      const payload = (await response.json()) as DetectSplitResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Split detection failed.");
      }
      const strongest = Array.isArray(payload.cuts)
        ? payload.cuts
            .map((cut) => ({
              time: Number(cut.time),
              confidence: Number(cut.confidence),
            }))
            .filter((cut) => Number.isFinite(cut.time) && Number.isFinite(cut.confidence))
            .sort((a, b) => b.confidence - a.confidence)[0]
        : null;

      if (!strongest) {
        setStatus("No cut detected in dragged region.");
        return;
      }
      insertSplitAt(strongest.time, "detected", strongest.confidence);
      seekTo(strongest.time);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Split detection failed.");
    } finally {
      setIsLoading(false);
    }
  };
  const activeIndex = Math.max(
    0,
    splits.findIndex((split) => split.id === activeSplitId),
  );
  return (
    <div className="relative flex h-full flex-col bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
      <div className="flex h-12 items-center justify-between border-b border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_84%,transparent)] px-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHelp((value) => !value)}>
            <CircleHelp />
            Help
          </Button>
          <span className="font-mono text-xs tracking-[0.16em] text-[var(--color-text-secondary)] uppercase">
            {status}
          </span>
        </div>
        <motion.div whileTap={{ scale: 0.98 }}>
          <Button
            variant="default"
            size="sm"
            onClick={openApprovalModal}
            disabled={!videoFile || splits.length === 0 || approvalStage === "processing"}
          >
            <Check />
            Approve
          </Button>
        </motion.div>
      </div>

      <AnimatePresence initial={false}>
        {showHelp ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-[var(--color-border-subtle)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_72%,transparent)]"
          >
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
              <span>`Space` play/pause</span>
              <span>`S` split at playhead</span>
              <span>`Delete` remove selected split</span>
              <span>`J / L` previous/next split</span>
              <span>`← / →` seek or nudge selected split</span>
              <span>`Enter` approve and save</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!videoUrl ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl"
          >
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="flex min-h-[360px] flex-col items-center justify-center rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-strong)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_78%,transparent)] px-8 text-center shadow-[var(--shadow-lg)]"
            >
              {isLoading ? (
                <>
                  <LoaderCircle className="mb-4 size-12 animate-spin text-[var(--color-text-accent)]" />
                  <p className="text-lg font-medium">Analyzing...</p>
                </>
              ) : (
                <>
                  <Film className="mb-4 size-12 text-[var(--color-text-accent)]" />
                  <p className="text-lg font-medium">Drop a video file to begin</p>
                  <p className="mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
                    Upload the file, run shot detection, and review the timeline.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center overflow-hidden px-4 py-6">
            <div className="flex w-full max-w-6xl flex-col items-center gap-4">
              <div className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] shadow-[var(--shadow-xl)]">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="h-full w-full bg-[var(--color-surface-secondary)] object-contain"
                  playsInline
                  onLoadedMetadata={(event) => {
                    const nextDuration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
                    setVideoDuration(nextDuration);
                    setSplits((current) =>
                      current.length > 0
                        ? normalizeSegments(
                            current.map((split) => ({
                              start: split.start,
                              end: split.end,
                              source: split.source,
                              confidence: split.confidence,
                            })),
                            nextDuration || getDurationFromSplits(current),
                          )
                        : current,
                    );
                  }}
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
              <Button
                variant="outline"
                size="lg"
                onClick={async () => {
                  if (!videoRef.current) {
                    return;
                  }
                  if (videoRef.current.paused) {
                    await videoRef.current.play();
                  } else {
                    videoRef.current.pause();
                  }
                }}
              >
                {isPlaying ? <Pause /> : <Play />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
            </div>
          </div>

          <div className="border-t border-[var(--color-border-subtle)] px-4 py-2">
            <div
              ref={timelineRef}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              className="relative h-14 cursor-crosshair overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_82%,transparent)]"
            >
              {selectedSplit ? (
                <motion.div
                  layout
                  className="pointer-events-none absolute inset-y-0 bg-[color:color-mix(in_oklch,var(--color-accent-base)_14%,transparent)] ring-1 ring-[color:color-mix(in_oklch,var(--color-accent-light)_50%,transparent)]"
                  style={{
                    left: `${(selectedSplit.start / duration) * 100}%`,
                    width: `${((selectedSplit.end - selectedSplit.start) / duration) * 100}%`,
                  }}
                />
              ) : null}

              {dragRegion ? (
                <motion.div
                  layout
                  className="pointer-events-none absolute inset-y-0 bg-[color:color-mix(in_oklch,var(--color-overlay-badge)_24%,transparent)] ring-1 ring-[var(--color-overlay-badge)]"
                  style={{
                    left: `${(dragRegion.start / duration) * 100}%`,
                    width: `${((dragRegion.end - dragRegion.start) / duration) * 100}%`,
                  }}
                />
              ) : null}

              {splitCuts.map((cut) => (
                <div
                  key={cut.id}
                  className="pointer-events-none absolute inset-y-0"
                  style={{ left: `${(cut.time / duration) * 100}%` }}
                >
                  <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2" style={{ backgroundColor: MARKER_COLORS[cut.source] }} />
                  <div className="absolute left-1/2 top-1 -translate-x-1/2 rounded-full bg-[var(--color-surface-primary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-strong)]">
                    {formatConfidence(cut.confidence)}
                  </div>
                </div>
              ))}
              <div className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
              <div className="pointer-events-none absolute inset-y-0 w-px bg-white" style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="border-t border-[var(--color-border-subtle)] px-4 py-3">
            <div className="scene-scrollbar-thin flex gap-3 overflow-x-auto pb-2">
              {splits.map((split, index) => (
                <div
                  key={split.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "w-40 shrink-0 cursor-pointer rounded-[var(--radius-lg)] border bg-[color:color-mix(in_oklch,var(--color-surface-secondary)_86%,transparent)] p-2 transition-[border-color,background-color] duration-200 focus-visible:outline-none",
                    activeSplitId === split.id
                      ? "border-[var(--color-accent-light)] bg-[color:color-mix(in_oklch,var(--color-accent-base)_14%,var(--color-surface-secondary))]"
                      : "border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]",
                  )}
                  onClick={() => {
                    setSelectedSplitId(split.id);
                    seekTo(split.start);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSplitId(split.id);
                      seekTo(split.start);
                    }
                  }}
                >
                  <div className="relative h-20 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface-tertiary)]">
                    {thumbnails.get(split.id) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbnails.get(split.id)} alt={`Shot ${index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="scene-skeleton h-full w-full" />
                    )}
                  </div>
                  <div className="mt-2 font-mono text-xs text-[var(--color-text-secondary)]">
                    #{index + 1} · {roundTime(split.end - split.start)}s
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--color-border-subtle)] px-4 py-2 font-mono text-xs text-[var(--color-text-secondary)]">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{videoFile?.name}</span>
              <span>{formatClock(currentTime)} / {formatClock(duration)}</span>
              <span>{splits.length} shots</span>
              <span>Active #{activeIndex + 1}</span>
              {isLoading ? (
                <span className="inline-flex items-center gap-1 text-[var(--color-text-accent)]">
                  <LoaderCircle className="size-3 animate-spin" />
                  Working
                </span>
              ) : null}
            </div>
          </div>
        </>
      )}

      <AnimatePresence>
        {approvalStage !== "idle" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[color:color-mix(in_oklch,var(--color-surface-primary)_64%,transparent)] px-4 backdrop-blur-xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              className="w-full max-w-xl rounded-[var(--radius-xl)] border p-6 shadow-[var(--shadow-xl)]"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 90%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 76%, transparent)",
              }}
            >
              {approvalStage === "metadata" ? (
                <form onSubmit={submitApproval} className="space-y-5">
                  <div className="space-y-2">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                      Add scene
                    </p>
                    <h2
                      className="text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Process approved splits into the database
                    </h2>
                    <p className="text-sm leading-7 text-[var(--color-text-secondary)]">
                      Save the reviewed scene, upload assets, classify every shot, and write records directly to Neon.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <label className="block">
                      <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                        Film title
                      </span>
                      <input
                        type="text"
                        value={filmForm.filmTitle}
                        onChange={(event) =>
                          setFilmForm((current) => ({ ...current, filmTitle: event.target.value }))
                        }
                        placeholder="The Godfather"
                        className="mt-2 w-full rounded-[var(--radius-md)] border px-3 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)]"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                          borderColor:
                            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                        }}
                      />
                    </label>

                    <label className="block">
                      <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                        Director
                      </span>
                      <input
                        type="text"
                        value={filmForm.director}
                        onChange={(event) =>
                          setFilmForm((current) => ({ ...current, director: event.target.value }))
                        }
                        placeholder="Francis Ford Coppola"
                        className="mt-2 w-full rounded-[var(--radius-md)] border px-3 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)]"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                          borderColor:
                            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                        }}
                      />
                    </label>

                    <label className="block">
                      <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                        Year
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={filmForm.year}
                        onChange={(event) =>
                          setFilmForm((current) => ({ ...current, year: event.target.value }))
                        }
                        placeholder="1972"
                        className="mt-2 w-full rounded-[var(--radius-md)] border px-3 py-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-tertiary)]"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                          borderColor:
                            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                        }}
                      />
                    </label>
                  </div>

                  {approvalError ? (
                    <div
                      className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm text-[var(--color-text-primary)]"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-overlay-badge) 12%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-overlay-badge) 48%, transparent)",
                      }}
                    >
                      {approvalError}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="outline" onClick={resetApprovalState}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      Process & Save
                    </Button>
                  </div>
                </form>
              ) : null}

              {approvalStage === "processing" ? (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                      Processing
                    </p>
                    <h2
                      className="text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Processing approved shots
                    </h2>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-[color:color-mix(in_oklch,var(--color-surface-primary)_72%,transparent)]">
                    <motion.div
                      className="h-full rounded-full bg-[var(--color-accent-light)]"
                      animate={{
                        width: `${((processingStepIndex + 1) / PROCESSING_STEPS.length) * 100}%`,
                      }}
                    />
                  </div>

                  <div className="space-y-3">
                    {PROCESSING_STEPS.map((step, index) => {
                      const isComplete = index < processingStepIndex;
                      const isActive = index === processingStepIndex;

                      return (
                        <div
                          key={step}
                          className="flex items-center justify-between rounded-[var(--radius-lg)] border px-4 py-3"
                          style={{
                            backgroundColor:
                              "color-mix(in oklch, var(--color-surface-primary) 68%, transparent)",
                            borderColor:
                              isActive || isComplete
                                ? "color-mix(in oklch, var(--color-accent-light) 40%, transparent)"
                                : "color-mix(in oklch, var(--color-border-default) 62%, transparent)",
                          }}
                        >
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                              Step {index + 1} / {PROCESSING_STEPS.length}
                            </p>
                            <p className="mt-1 text-sm text-[var(--color-text-primary)]">{step}</p>
                          </div>
                          {isComplete ? (
                            <Check className="text-[var(--color-text-accent)]" />
                          ) : (
                            <LoaderCircle
                              className={cn(
                                "text-[var(--color-text-secondary)]",
                                isActive ? "animate-spin text-[var(--color-text-accent)]" : "",
                              )}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {approvalStage === "success" ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[color:color-mix(in_oklch,var(--color-accent-base)_20%,transparent)] text-[var(--color-text-accent)]">
                    <Check className="size-7" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                      Saved
                    </p>
                    <h2
                      className="text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {successMessage}
                    </h2>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Redirecting to the home page.
                    </p>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
