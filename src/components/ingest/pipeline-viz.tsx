"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  sanitizeIngestErrorDetailsText,
  sanitizeIngestHttpErrorBody,
} from "@/lib/ingest-error-sanitize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepId = "detect" | "lookup" | "extract" | "classify" | "group" | "write";

type StepInfo = {
  id: StepId;
  label: string;
  status: "pending" | "active" | "complete";
  duration?: number;
  startedAt?: number;
  /** Latest server message for this step. */
  detail?: string;
};

type FrameState = {
  index: number;
  extract: "pending" | "active" | "complete";
  classify: "pending" | "active" | "complete";
  write: "pending" | "active" | "complete";
  movementType?: string;
  worker?: number;
  extractStartedAt?: number;
  extractDuration?: number;
  classifyStartedAt?: number;
  classifyDuration?: number;
};

type BackgroundPollSnapshot = {
  status: string;
  stage: string;
  message?: string;
  totalShots?: number;
  extractDone?: number;
  classifyDone?: number;
  writeDone?: number;
};

type PipelineState = {
  steps: StepInfo[];
  frames: FrameState[];
  totalShots: number;
  concurrency: number;
  startTime: number;
  result: { filmId: string; filmTitle: string; shotCount: number } | null;
  error: string | null;
  /** Async job polling; drives step labels + aggregate counts. */
  backgroundPoll: BackgroundPollSnapshot | null;
};

const STEP_DEFS: { id: StepId; label: string }[] = [
  { id: "detect", label: "Detect" },
  { id: "lookup", label: "Lookup" },
  { id: "extract", label: "Extract" },
  { id: "classify", label: "Classify" },
  { id: "group", label: "Prepare" },
  { id: "write", label: "Write" },
];

const ASYNC_JOB_SESSION_KEY = "metrovision_ingest_async_job";

function buildStepsFromPipelineStage(stage: string, detail?: string): StepInfo[] {
  const order: StepId[] = ["detect", "lookup", "extract", "classify", "group", "write"];
  if (stage === "complete") {
    return STEP_DEFS.map((s) => ({ ...s, status: "complete" as const }));
  }
  if (stage === "failed") {
    return STEP_DEFS.map((s) => ({ ...s, status: "complete" as const }));
  }
  let activeIdx = order.indexOf(stage as StepId);
  if (stage === "queued" || stage === "running") activeIdx = 0;
  if (activeIdx < 0) activeIdx = 0;
  return STEP_DEFS.map((s) => {
    const idx = order.indexOf(s.id);
    if (idx < activeIdx) return { ...s, status: "complete" as const };
    if (idx === activeIdx) return { ...s, status: "active" as const, detail };
    return { ...s, status: "pending" as const };
  });
}

function getIngestAsyncPostUrl(): string {
  return "/api/ingest-film/async";
}

/** Prefer the latest active step so the header matches the true phase if an earlier step stayed "active". */
function rightmostActiveStep(steps: StepInfo[]): StepInfo | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === "active") return steps[i];
  }
  return undefined;
}

// Benchmark estimates (seconds) — used before real data is available
// These are rough averages; real ETAs replace them once shots start completing
const STEP_ESTIMATES: Record<StepId, (totalShots: number, concurrency: number) => number> = {
  detect: () => 90,            // content detector ~1-2 min
  lookup: () => 3,            // TMDB API calls
  extract: (n, c) => (n / Math.max(c * 2, 1)) * 1.5,  // ~1.5s per shot, 2x concurrency
  classify: (n, c) => (n / Math.max(c * 3, 1)) * 8,    // ~8s per shot, 3x concurrency (Gemini)
  group: () => 2,             // fast
  write: (n) => n * 0.3,     // S3 upload + DB write batched
};

// Pacing colors and messages
const PACING = {
  green: { color: "#5cd69b", bg: "rgba(92,214,155,0.08)", label: "On track — relax and enjoy" },
  yellow: { color: "#d6a05c", bg: "rgba(214,160,92,0.08)", label: "Getting dicey — hold onto your pants" },
  red: { color: "#d65c6b", bg: "rgba(214,92,107,0.08)", label: "Taking longer than expected. If I'm red for a while, something got messed up. Sorry!" },
};

/** Split error string for UI: short summary vs collapsible troubleshooting (see appendIngestErrorDetails). */
const INGEST_ERR_DETAIL_SEP = "\n---\n";

function appendIngestErrorDetails(summary: string, details: string): string {
  return `${summary.trim()}${INGEST_ERR_DETAIL_SEP}${details.trim()}`;
}

function splitIngestErrorDisplay(message: string): { summary: string; details: string | null } {
  const parts = message.split(INGEST_ERR_DETAIL_SEP);
  if (parts.length >= 2) {
    return {
      summary: parts[0]!.trim(),
      details: parts.slice(1).join(INGEST_ERR_DETAIL_SEP).trim(),
    };
  }
  return { summary: message.trim(), details: null };
}

const INGEST_NETWORK_TROUBLESHOOT = `Common causes: offline or flaky network, VPN/firewall/proxy blocking this site, or a browser extension (ad blocker) blocking fetch. Try another network or a private window.

If it happens immediately: DevTools → Network → retry ingest → inspect POST /api/ingest-film/async and GET /api/ingest-film/jobs/… (status, blocked, CORS).

If jobs stay queued or fail: set INGEST_WORKER_URL (or NEXT_PUBLIC_WORKER_URL) to your TS worker origin and confirm the worker is reachable; check Vercel and worker logs.`;

// ---------------------------------------------------------------------------
// ETA Hook
// ---------------------------------------------------------------------------

function useETAs(state: PipelineState, elapsed: number) {
  const { frames, totalShots, concurrency, steps } = state;
  const n = totalShots || 30; // estimate 30 shots if not yet known
  const c = concurrency;

  // Real averages from completed shots
  const extractDurations = frames.filter((f) => f.extractDuration != null).map((f) => f.extractDuration!);
  const classifyDurations = frames.filter((f) => f.classifyDuration != null).map((f) => f.classifyDuration!);
  const avgExtract = extractDurations.length >= 2 ? extractDurations.reduce((a, b) => a + b, 0) / extractDurations.length : null;
  const avgClassify = classifyDurations.length >= 2 ? classifyDurations.reduce((a, b) => a + b, 0) / classifyDurations.length : null;

  const extracted = frames.filter((f) => f.extract === "complete").length;
  const classified = frames.filter((f) => f.classify === "complete").length;
  const written = frames.filter((f) => f.write === "complete").length;

  // Per-step ETA: use real data if available, benchmarks otherwise
  const stepETAs: Record<StepId, number> = {
    detect: STEP_ESTIMATES.detect(n, c),
    lookup: STEP_ESTIMATES.lookup(n, c),
    extract: avgExtract !== null
      ? ((n - extracted) / Math.max(c, 1)) * avgExtract
      : STEP_ESTIMATES.extract(n, c),
    classify: avgClassify !== null
      ? ((n - classified) / Math.max(c, 1)) * avgClassify
      : STEP_ESTIMATES.classify(n, c),
    group: STEP_ESTIMATES.group(n, c),
    write: STEP_ESTIMATES.write(n, c) - (written * 0.4),
  };

  // For completed steps, ETA is 0
  // For active steps, subtract time already spent
  const stepRemainingETAs: Record<StepId, number> = {} as Record<StepId, number>;
  for (const step of steps) {
    if (step.status === "complete") {
      stepRemainingETAs[step.id] = 0;
    } else if (step.status === "active" && step.startedAt) {
      const spent = (Date.now() - step.startedAt) / 1000;
      stepRemainingETAs[step.id] = Math.max(0, stepETAs[step.id] - spent);
    } else {
      stepRemainingETAs[step.id] = stepETAs[step.id];
    }
  }

  // Total remaining = sum of non-complete steps
  const totalRemaining = Object.values(stepRemainingETAs).reduce((a, b) => a + b, 0);

  // Total estimated (from the start) = sum of all step estimates
  const totalEstimate = Object.entries(stepETAs).reduce((sum, [id, est]) => {
    const step = steps.find((s) => s.id === id);
    return sum + (step?.duration ?? est);
  }, 0);

  let pacing: "green" | "yellow" | "red" = "green";
  if (totalEstimate > 0) {
    const ratio = elapsed / Math.max(totalEstimate, 1);
    if (ratio > 1.5) pacing = "red";
    else if (ratio > 1.1) pacing = "yellow";
  }

  return { stepETAs: stepRemainingETAs, totalRemaining, totalEstimate, pacing, avgExtract, avgClassify };
}

// ---------------------------------------------------------------------------
// Detection Animation
// ---------------------------------------------------------------------------

function DetectionAnimation({ elapsed, eta }: { elapsed: number; eta: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const barCount = 80;
    const barWidth = w / barCount;
    const phases = Array.from({ length: barCount }, () => Math.random() * Math.PI * 2);
    const speeds = Array.from({ length: barCount }, () => 0.8 + Math.random() * 2.5);
    const amplitudes = Array.from({ length: barCount }, (_, i) => {
      const center = barCount / 2;
      const dist = Math.abs(i - center) / center;
      return 0.3 + (1 - dist * dist) * 0.7;
    });

    let frame = 0;

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const time = frame * 0.016;
      frame++;

      // Scan line
      const scanY = ((time * 40) % (h + 20)) - 10;
      const scanGrad = ctx.createLinearGradient(0, scanY - 8, 0, scanY + 8);
      scanGrad.addColorStop(0, "transparent");
      scanGrad.addColorStop(0.5, "rgba(92, 184, 214, 0.15)");
      scanGrad.addColorStop(1, "transparent");
      ctx.fillStyle = scanGrad;
      ctx.fillRect(0, scanY - 8, w, 16);

      // Waveform bars
      for (let i = 0; i < barCount; i++) {
        const x = i * barWidth + barWidth * 0.15;
        const bw = barWidth * 0.7;
        const amplitude = amplitudes[i] * (0.4 + 0.6 * Math.sin(time * speeds[i] + phases[i]) ** 2);
        const barH = amplitude * (h * 0.6);
        const y = (h - barH) / 2;
        const hue = 190 + (i / barCount) * 30;
        const lightness = 55 + amplitude * 20;
        ctx.fillStyle = `oklch(${lightness}% 0.14 ${hue} / ${0.4 + amplitude * 0.4})`;
        ctx.beginPath();
        ctx.roundRect(x, y, bw, barH, Math.min(bw / 2, 2));
        ctx.fill();
      }

      ctx.fillStyle = "rgba(245, 245, 247, 0.5)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("ANALYZING TEMPORAL STRUCTURE", w / 2, h - 12);

      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] border"
      style={{ backgroundColor: "#0d0d12", borderColor: "color-mix(in oklch, var(--color-border-default) 50%, transparent)", height: "200px" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Film grain */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        animation: "pipeline-viz-film-grain 0.5s steps(10) infinite",
      }} />
      {/* Gate corners */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-3 top-3 h-4 w-4 border-l border-t border-[var(--color-accent-base)] opacity-30" />
        <div className="absolute right-3 top-3 h-4 w-4 border-r border-t border-[var(--color-accent-base)] opacity-30" />
        <div className="absolute bottom-3 left-3 h-4 w-4 border-b border-l border-[var(--color-accent-base)] opacity-30" />
        <div className="absolute bottom-3 right-3 h-4 w-4 border-b border-r border-[var(--color-accent-base)] opacity-30" />
      </div>
      {/* ETA badge */}
      <div className="absolute right-4 top-4 text-right">
        <p className="font-mono text-[10px] tabular-nums text-[var(--color-text-tertiary)]">
          {formatTimeCompact(elapsed)} elapsed
        </p>
        <p className="font-mono text-[10px] tabular-nums text-[var(--color-accent-base)]">
          ~{formatTimeCompact(Math.max(0, Math.round(eta - elapsed)))} remaining
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type PipelineVizProps = {
  videoPath: string;
  filmTitle: string;
  director: string;
  year: number;
  concurrency: number;
  detector?: "content" | "adaptive"; // default adaptive (see ingest page)
  /** DB boundary_cut_presets id — forwarded to worker ingest (omit for Auto / film default). */
  boundaryCutPresetId?: string;
  /** Inclusive window in seconds; omit for full file (detection still scans whole video). */
  ingestStartSec?: number;
  ingestEndSec?: number;
  /** When set with non-empty `reclassifyShotIds`, worker skips detection and full film reset; only these shots are re-extracted and classified. */
  reclassifyFilmId?: string;
  reclassifyShotIds?: string[];
  onComplete?: (result: { filmId: string; shotCount: number }) => void;
  onError?: (error: string) => void;
};

export function PipelineViz({
  videoPath,
  filmTitle,
  director,
  year,
  concurrency,
  detector = "adaptive",
  boundaryCutPresetId,
  ingestStartSec,
  ingestEndSec,
  reclassifyFilmId,
  reclassifyShotIds,
  onComplete,
  onError,
}: PipelineVizProps) {
  const selectiveReclassify =
    Boolean(reclassifyFilmId?.trim()) &&
    Array.isArray(reclassifyShotIds) &&
    reclassifyShotIds.length > 0;
  const effectiveIngestStartSec = selectiveReclassify ? undefined : ingestStartSec;
  const effectiveIngestEndSec = selectiveReclassify ? undefined : ingestEndSec;
  const [state, setState] = useState<PipelineState>({
    steps: STEP_DEFS.map((s) => ({ ...s, status: "pending" as const })),
    frames: [],
    totalShots: 0,
    concurrency,
    startTime: Date.now(),
    result: null,
    error: null,
    backgroundPoll: { status: "starting", stage: "queued", message: "Starting…" },
  });

  const [elapsed, setElapsed] = useState(0);
  const asyncCompleteNotifiedRef = useRef(false);

  useEffect(() => {
    setState({
      steps: STEP_DEFS.map((s) => ({ ...s, status: "pending" as const })),
      frames: [],
      totalShots: 0,
      concurrency,
      startTime: Date.now(),
      result: null,
      error: null,
      backgroundPoll: { status: "starting", stage: "queued", message: "Starting…" },
    });
    setElapsed(0);
    asyncCompleteNotifiedRef.current = false;
  }, [
    videoPath,
    filmTitle,
    year,
    director,
    concurrency,
    detector,
    boundaryCutPresetId,
    ingestStartSec,
    ingestEndSec,
    reclassifyFilmId,
    reclassifyShotIds,
  ]);

  useEffect(() => {
    const ac = new AbortController();
    let intervalId: number | undefined;

    (async () => {
      try {
        const isHttpSource = /^https?:\/\//i.test(videoPath);
        const bodyPayload = {
          ...(isHttpSource
            ? { videoUrl: videoPath, filmTitle, director, year, concurrency, detector }
            : { videoPath, filmTitle, director, year, concurrency, detector }),
          ...(boundaryCutPresetId?.trim() ? { boundaryCutPresetId: boundaryCutPresetId.trim() } : {}),
          ...(effectiveIngestStartSec !== undefined ? { ingestStartSec: effectiveIngestStartSec } : {}),
          ...(effectiveIngestEndSec !== undefined ? { ingestEndSec: effectiveIngestEndSec } : {}),
          ...(selectiveReclassify
            ? { filmId: reclassifyFilmId!.trim(), reclassifyShotIds: reclassifyShotIds! }
            : {}),
        };

        const startRes = await fetch(getIngestAsyncPostUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
          signal: ac.signal,
        });

        if (!startRes.ok) {
          const errText = await startRes.text();
          let msg: string;
          try {
            const j = JSON.parse(errText) as { error?: string; proxyTarget?: string };
            if (typeof j.error === "string") {
              msg =
                j.proxyTarget && !j.error.includes(j.proxyTarget)
                  ? `${j.error} — target: ${j.proxyTarget}`
                  : j.error;
            } else {
              msg = sanitizeIngestHttpErrorBody(startRes.status, errText);
            }
          } catch {
            msg = sanitizeIngestHttpErrorBody(startRes.status, errText);
          }
          setState((s) => ({ ...s, error: msg }));
          onError?.(msg);
          return;
        }

        const startJson = (await startRes.json()) as { jobId?: string; pollToken?: string };
        if (typeof startJson.jobId !== "string" || typeof startJson.pollToken !== "string") {
          const msg = "Async ingest started but response missing jobId or pollToken.";
          setState((s) => ({ ...s, error: msg }));
          onError?.(msg);
          return;
        }

        try {
          sessionStorage.setItem(
            ASYNC_JOB_SESSION_KEY,
            JSON.stringify({
              jobId: startJson.jobId,
              pollToken: startJson.pollToken,
              filmTitle,
              year,
            }),
          );
        } catch {
          /* quota / private mode */
        }

        const pollOnce = async () => {
          const r = await fetch(
            `/api/ingest-film/jobs/${encodeURIComponent(startJson.jobId!)}?t=${encodeURIComponent(startJson.pollToken!)}`,
            { signal: ac.signal },
          );
          if (!r.ok) {
            const errText = await r.text();
            let msg: string;
            try {
              const j = JSON.parse(errText) as { error?: string };
              msg = typeof j.error === "string" ? j.error : sanitizeIngestHttpErrorBody(r.status, errText);
            } catch {
              msg = sanitizeIngestHttpErrorBody(r.status, errText);
            }
            setState((s) => ({ ...s, error: msg }));
            onError?.(msg);
            if (intervalId) window.clearInterval(intervalId);
            return;
          }

          const data = (await r.json()) as {
            status?: string;
            stage?: string;
            progress?: Record<string, unknown> | null;
            filmId?: string | null;
            errorMessage?: string | null;
          };

          const prog = data.progress;
          const stageFromProg = typeof prog?.stage === "string" ? prog.stage : null;
          const effectiveStage = stageFromProg ?? data.stage ?? "queued";
          const message = typeof prog?.message === "string" ? prog.message : undefined;
          const totalShots =
            typeof prog?.totalShots === "number" ? prog.totalShots : undefined;
          const extractDone =
            typeof prog?.extractDone === "number" ? prog.extractDone : undefined;
          const classifyDone =
            typeof prog?.classifyDone === "number" ? prog.classifyDone : undefined;
          const writeDone = typeof prog?.writeDone === "number" ? prog.writeDone : undefined;

          if (data.status === "failed") {
            const msg = (data.errorMessage ?? "Ingest failed").trim() || "Ingest failed";
            setState((s) => ({
              ...s,
              error: msg,
              steps: buildStepsFromPipelineStage("failed", message),
              backgroundPoll: {
                status: "failed",
                stage: effectiveStage,
                message,
                totalShots,
                extractDone,
                classifyDone,
                writeDone,
              },
            }));
            onError?.(msg);
            if (intervalId) window.clearInterval(intervalId);
            return;
          }

          if (data.status === "completed" && typeof data.filmId === "string") {
            const shotCount = typeof prog?.shotCount === "number" ? prog.shotCount : 0;
            setState((s) => ({
              ...s,
              result: {
                filmId: data.filmId!,
                filmTitle,
                shotCount,
              },
              totalShots: totalShots ?? s.totalShots,
              steps: buildStepsFromPipelineStage("complete"),
              error: null,
              backgroundPoll: {
                status: "completed",
                stage: "complete",
                message,
                totalShots,
                extractDone,
                classifyDone,
                writeDone,
              },
            }));
            if (!asyncCompleteNotifiedRef.current) {
              asyncCompleteNotifiedRef.current = true;
              onComplete?.({ filmId: data.filmId!, shotCount });
            }
            if (intervalId) window.clearInterval(intervalId);
            return;
          }

          setState((s) => ({
            ...s,
            totalShots: totalShots ?? s.totalShots,
            steps: buildStepsFromPipelineStage(effectiveStage, message),
            backgroundPoll: {
              status: data.status ?? "running",
              stage: effectiveStage,
              message,
              totalShots,
              extractDone,
              classifyDone,
              writeDone,
            },
          }));
        };

        await pollOnce();
        intervalId = window.setInterval(() => {
          void pollOnce();
        }, 4_000);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const e = err as Error;
        let message = (e?.message ?? String(e)).trim() || "Request failed";
        if (/failed to fetch|network\s*error|load failed|networkerror|connection.*refused|aborted/i.test(message)) {
          message = appendIngestErrorDetails(message, INGEST_NETWORK_TROUBLESHOOT);
        }
        setState((s) => ({ ...s, error: message }));
        onError?.(message);
      }
    })();

    return () => {
      ac.abort();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [
    videoPath,
    filmTitle,
    director,
    year,
    concurrency,
    detector,
    boundaryCutPresetId,
    ingestStartSec,
    ingestEndSec,
    reclassifyFilmId,
    reclassifyShotIds,
    selectiveReclassify,
    effectiveIngestStartSec,
    effectiveIngestEndSec,
    onComplete,
    onError,
  ]);

  useEffect(() => {
    if (state.result || state.error) return;
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - state.startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [state.startTime, state.result, state.error]);

  // Computed
  const extracted = state.backgroundPoll?.extractDone ?? 0;
  const classified = state.backgroundPoll?.classifyDone ?? 0;
  const written = state.backgroundPoll?.writeDone ?? 0;
  const activeStep = rightmostActiveStep(state.steps);
  const isDetecting =
    activeStep?.id === "detect" ||
    (activeStep?.id === "lookup" && state.totalShots === 0) ||
    state.backgroundPoll?.stage === "detect" ||
    state.backgroundPoll?.stage === "queued" ||
    state.backgroundPoll?.stage === "running";

  const errorPlainParts = state.error ? splitIngestErrorDisplay(state.error) : null;

  const barTotal = state.totalShots || state.backgroundPoll?.totalShots || 0;
  const overallPct =
    barTotal > 0
      ? Math.min(
          100,
          (((state.backgroundPoll?.extractDone ?? 0) +
            (state.backgroundPoll?.classifyDone ?? 0) +
            (state.backgroundPoll?.writeDone ?? 0)) /
            (3 * barTotal)) *
            100,
        )
      : 0;

  const etas = useETAs(state, elapsed);
  const pacingInfo = PACING[etas.pacing];

  // Step progress percentages
  function getStepProgress(stepId: StepId): number {
    const step = state.steps.find((s) => s.id === stepId);
    if (step?.status === "complete") return 100;
    if (step?.status === "pending") return 0;
    if (state.totalShots === 0 && (stepId === "extract" || stepId === "classify" || stepId === "write")) {
      return 0;
    }
    switch (stepId) {
      case "extract":
        return state.totalShots > 0 ? (extracted / state.totalShots) * 100 : 0;
      case "classify":
        return state.totalShots > 0 ? (classified / state.totalShots) * 100 : 0;
      case "write":
        return state.totalShots > 0 ? (written / state.totalShots) * 100 : 0;
      case "detect": {
        const spent = step?.startedAt ? (Date.now() - step.startedAt) / 1000 : 0;
        return Math.min(95, (spent / STEP_ESTIMATES.detect(state.totalShots || 30, state.concurrency)) * 100);
      }
      case "lookup":
        return 50;
      case "group":
        return 50;
      default:
        return 0;
    }
  }

  return (
    <div className="space-y-6">

        {/* ─── Header ─── */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
              {state.result ? "Ingestion complete" : activeStep ? activeStep.label : "Initializing"}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-[var(--letter-spacing-snug)]" style={{ fontFamily: "var(--font-heading)" }}>
              {filmTitle}
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--color-text-tertiary)]">
              {director} &middot; {year}
            </p>
            {activeStep?.detail ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {activeStep.detail}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-3">
              <p className="text-3xl font-bold tabular-nums" style={{ fontFamily: "var(--font-mono)", color: state.result ? "#5cd69b" : pacingInfo.color }}>
                {formatTimeCompact(elapsed)}
              </p>
              {!state.result && etas.totalRemaining > 0 ? (
                <p className="font-mono text-lg tabular-nums text-[var(--color-text-tertiary)]">
                  / ~{formatTimeCompact(Math.round(elapsed + etas.totalRemaining))}
                </p>
              ) : null}
            </div>
            {!state.result ? (
              <p className="mt-1 font-mono text-[10px] transition-colors duration-500" style={{ color: pacingInfo.color }}>
                {pacingInfo.label}
              </p>
            ) : (
              <p className="mt-1 font-mono text-[10px] text-[var(--color-status-verified)]">
                Total time: {formatTimeCompact(elapsed)}
              </p>
            )}
          </div>
        </div>

        <div
          className="rounded-[var(--radius-lg)] border px-4 py-3 text-sm leading-relaxed text-[var(--color-text-secondary)]"
          style={{
            borderColor: "color-mix(in oklch, var(--color-accent-base) 35%, transparent)",
            backgroundColor: "color-mix(in oklch, var(--color-accent-base) 8%, transparent)",
          }}
        >
          <p>
            <strong className="text-[var(--color-text-primary)]">Background job</strong> — ingest is enqueued on the worker;
            this page polls every few seconds. You can navigate away or close the tab; the worker keeps running. Re-open this
            site in the same browser to reuse the poll token from session storage, or check{" "}
            <Link href="/browse" className="text-[var(--color-accent-base)] underline-offset-2 hover:underline">
              Browse
            </Link>{" "}
            for your film when the job completes.
          </p>
          {state.backgroundPoll?.message ? (
            <p className="mt-2 font-mono text-xs text-[var(--color-text-tertiary)]">{state.backgroundPoll.message}</p>
          ) : null}
        </div>

        {/* ─── Progress bar ─── */}
        <div className="relative h-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-surface-tertiary)" }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${state.result ? 100 : overallPct}%`,
              backgroundColor: state.result ? "#5cd69b" : pacingInfo.color,
              boxShadow: `0 0 12px ${pacingInfo.color}66`,
            }}
          />
        </div>

        {/* ─── Phase indicators with mini progress bars + ETAs ─── */}
        <div className="grid grid-cols-6 gap-2">
          {state.steps.map((step) => {
            const progress = getStepProgress(step.id);
            const remaining = etas.stepETAs[step.id];
            const stepColor = step.status === "complete" ? "#5cd69b" : step.status === "active" ? "#5cb8d6" : "#2a2a33";

            return (
              <div
                key={step.id}
                className="rounded-[var(--radius-md)] border px-3 py-2.5 transition-all duration-300"
                style={{
                  borderColor: step.status === "active" ? `${stepColor}66` : "#1e1e28",
                  backgroundColor: step.status === "active" ? "rgba(92,184,214,0.04)" : step.status === "complete" ? "rgba(92,214,155,0.04)" : "#13131a",
                }}
              >
                {/* Step label + status dot */}
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-1.5 w-1.5 rounded-full transition-all duration-300"
                    style={{
                      backgroundColor: stepColor,
                      boxShadow: step.status === "active" ? `0 0 6px ${stepColor}` : "none",
                      animation:
                        step.status === "active"
                          ? "pipeline-viz-pulse-dot 1.5s ease-in-out infinite"
                          : "none",
                      color: `${stepColor}88`,
                    }}
                  />
                  <span
                    className="font-mono text-[9px] font-bold uppercase tracking-[var(--letter-spacing-wide)]"
                    style={{ color: step.status === "pending" ? "#44444e" : stepColor }}
                  >
                    {step.label}
                  </span>
                </div>

                {/* Mini progress bar */}
                <div className="step-progress-track mt-2">
                  <div
                    className="step-progress-fill"
                    style={{
                      width: `${step.status === "complete" ? 100 : progress}%`,
                      backgroundColor: stepColor,
                      boxShadow: step.status === "active" ? `0 0 4px ${stepColor}44` : "none",
                    }}
                  />
                </div>

                {/* Duration or ETA */}
                <p className="mt-1.5 font-mono text-[8px] tabular-nums text-[var(--color-text-tertiary)]">
                  {step.status === "complete" && step.duration !== undefined
                    ? formatDuration(step.duration)
                    : step.status === "active" && remaining > 0
                      ? `~${formatTimeCompact(Math.round(remaining))} left`
                      : step.status === "pending" && remaining > 0
                        ? `est. ${formatTimeCompact(Math.round(remaining))}`
                        : "\u00A0" /* nbsp to maintain height */}
                </p>
              </div>
            );
          })}
        </div>

        {/* ─── Detection Animation ─── */}
        {isDetecting && state.frames.length === 0 ? (
          <DetectionAnimation elapsed={elapsed} eta={STEP_ESTIMATES.detect(30, concurrency)} />
        ) : null}

        {/* ─── Stats ─── */}
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex gap-8">
            <StatCounter label="Extracted" value={extracted} total={state.totalShots} eta={etas.stepETAs.extract} color="#5cb8d6" />
            <StatCounter label="Classified" value={classified} total={state.totalShots} eta={etas.stepETAs.classify} color="#9b7cd6" />
            <StatCounter label="Written" value={written} total={state.totalShots} color="#5cd69b" />
          </div>
        </div>

        {/* ─── Result ─── */}
        {state.result ? (
          <div className="rounded-[var(--radius-xl)] border p-6" style={{ backgroundColor: "rgba(92,214,155,0.06)", borderColor: "rgba(92,214,155,0.3)" }}>
            <h3 className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[#5cd69b]">Film Ingested — {formatTimeCompact(elapsed)}</h3>
            <div className="mt-4">
              <p className="text-3xl font-bold text-[var(--color-text-primary)]">{state.result.shotCount}</p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Shots analyzed</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] text-[var(--color-text-tertiary)]">
              {state.steps.filter((s) => s.duration).map((s) => <span key={s.id}>{s.label}: {formatDuration(s.duration!)}</span>)}
            </div>
            <div className="mt-6 flex gap-3">
              <Link href={`/film/${state.result.filmId}`} className="rounded-[var(--radius-md)] px-4 py-2 text-sm text-[var(--color-text-primary)]" style={{ backgroundColor: "var(--color-interactive-default)", boxShadow: "var(--shadow-glow)" }}>View Film Analysis</Link>
              <Link href="/browse" className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]">Browse Archive</Link>
            </div>
          </div>
        ) : null}

        {/* ─── Error ─── */}
        {state.error && errorPlainParts ? (
          <div
            className="rounded-[var(--radius-xl)] border p-6"
            style={{
              backgroundColor: "rgba(214,92,107,0.06)",
              borderColor: "rgba(214,92,107,0.3)",
            }}
          >
            <h3
              className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)]"
              style={{ color: "#d65c6b" }}
            >
              Pipeline error
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {sanitizeIngestErrorDetailsText(errorPlainParts.summary)}
            </p>
            {errorPlainParts.details ? (
              <details className="mt-4">
                <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Troubleshooting
                </summary>
                <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-[var(--color-text-tertiary)]">
                  {sanitizeIngestErrorDetailsText(errorPlainParts.details)}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCounter({ label, value, total, eta, color }: { label: string; value: number; total?: number; eta?: number; color?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-primary)]" style={{ fontFamily: "var(--font-mono)" }}>
        <span style={{ color }}>{value}</span>
        {total !== undefined && total > 0 ? <span className="text-sm text-[var(--color-text-tertiary)]">/{total}</span> : null}
      </p>
      {eta != null && eta > 1 ? <p className="font-mono text-[8px] tabular-nums text-[var(--color-text-tertiary)]">~{formatTimeCompact(Math.round(eta))} left</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeCompact(s: number): string {
  if (s < 0) return "0s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
}

function formatDuration(d: number): string {
  if (d < 1) return `${(d * 1000).toFixed(0)}ms`;
  if (d < 60) return `${d.toFixed(1)}s`;
  return `${Math.floor(d / 60)}m ${Math.round(d % 60)}s`;
}
