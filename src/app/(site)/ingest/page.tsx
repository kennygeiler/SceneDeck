"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { PipelineViz } from "@/components/ingest/pipeline-viz";

type IngestPhase = "form" | "uploading" | "processing";

/** Empty, 0, or invalid → undefined; supports optional `763,222`-style decimals. */
function tryParseOptionalTimelineBound(
  raw: string,
  role: "start" | "end",
): { ok: true; value: number | undefined } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === "") return { ok: true, value: undefined };
  let s = t;
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      message:
        role === "start"
          ? "Timeline start must be a valid number (seconds). Use a dot or single comma for decimals (e.g. 763.222)."
          : "Timeline end must be a valid number (seconds). Use a dot or single comma for decimals (e.g. 763.222).",
    };
  }
  if (n === 0) return { ok: true, value: undefined };
  if (role === "start" && n < 0) {
    return { ok: false, message: "Timeline start cannot be negative." };
  }
  if (role === "end" && n < 0) {
    return { ok: false, message: "Timeline end must be positive, or use 0 / empty for full length." };
  }
  return { ok: true, value: n };
}

/** API routes may return JSON `{ error }` or plain/HTML (e.g. 413 Request Entity Too Large on Vercel). */
async function readFetchErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return `Request failed (HTTP ${res.status})`;
  try {
    const j = JSON.parse(trimmed) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) return j.error.trim();
  } catch {
    /* not JSON */
  }
  const oneLine = trimmed.replace(/\s+/g, " ").slice(0, 300);
  return oneLine || `Request failed (HTTP ${res.status})`;
}

function uploadSizeHint(status: number, message: string): string {
  const tooBig =
    status === 413 ||
    /request entity too large|payload too large|body exceeded|FUNCTION_PAYLOAD_TOO_LARGE/i.test(
      message,
    );
  return tooBig
    ? " Large files must use direct-to-S3 upload: set NEXT_PUBLIC_WORKER_URL (or run ingest locally) instead of sending the video through this server."
    : "";
}

export default function IngestPage() {
  const [phase, setPhase] = useState<IngestPhase>("form");
  const [filmTitle, setFilmTitle] = useState("");
  const [director, setDirector] = useState("");
  const [year, setYear] = useState("");
  const [concurrency, setConcurrency] = useState(5);
  const [detector, setDetector] = useState<"content" | "adaptive">("adaptive");
  const [ingestTimelineStart, setIngestTimelineStart] = useState("");
  const [ingestTimelineEnd, setIngestTimelineEnd] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  /** Set when a run starts (after upload succeeds) so the pipeline request includes optional timeline bounds. */
  const [ingestTimelineForRun, setIngestTimelineForRun] = useState<{
    ingestStartSec?: number;
    ingestEndSec?: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
  const useRemoteWorker = !!workerUrl;

  async function handleStart() {
    if (!selectedFile || !filmTitle || !director || !year) return;

    const startParsed = tryParseOptionalTimelineBound(ingestTimelineStart, "start");
    if (!startParsed.ok) {
      setUploadError(startParsed.message);
      return;
    }
    const endParsed = tryParseOptionalTimelineBound(ingestTimelineEnd, "end");
    if (!endParsed.ok) {
      setUploadError(endParsed.message);
      return;
    }
    const ingestStartSec = startParsed.value;
    const ingestEndSec = endParsed.value;
    if (ingestEndSec !== undefined && ingestEndSec <= (ingestStartSec ?? 0)) {
      setUploadError(
        ingestStartSec !== undefined
          ? "Timeline end must be greater than timeline start."
          : "Timeline end must be greater than 0 (seconds), or leave empty for full length.",
      );
      return;
    }

    setPhase("uploading");
    setUploadError(null);
    setIngestTimelineForRun(null);

    try {
      let resolvedPath: string;

      if (useRemoteWorker) {
        // Step 1: Get presigned PUT URL from our API
        const urlRes = await fetch("/api/upload-to-s3", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            fileType: selectedFile.type || "video/mp4",
            filmTitle,
            year,
          }),
        });
        if (!urlRes.ok) {
          const msg = await readFetchErrorMessage(urlRes);
          throw new Error(msg || "Failed to get upload URL");
        }
        const { putUrl, videoUrl } = await urlRes.json();

        // Step 2: Upload directly from browser to S3 (no proxy)
        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { "Content-Type": selectedFile.type || "video/mp4" },
          body: selectedFile,
        });
        if (!putRes.ok) {
          throw new Error(`S3 upload failed: ${putRes.status}`);
        }

        resolvedPath = videoUrl; // presigned S3 GET URL for worker
      } else {
        // Upload to local server temp directory
        const formData = new FormData();
        formData.append("video", selectedFile);

        const uploadRes = await fetch("/api/upload-video", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const msg = await readFetchErrorMessage(uploadRes);
          throw new Error(
            (msg || "Upload failed") + uploadSizeHint(uploadRes.status, msg),
          );
        }
        const { videoPath: path } = await uploadRes.json();
        resolvedPath = path; // local file path
      }

      setIngestTimelineForRun({ ingestStartSec, ingestEndSec });
      setVideoPath(resolvedPath);
      setPhase("processing");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadError(message);
      setPhase("form");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      {/* Header */}
      <div>
        <Link
          href="/browse"
          className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-accent)]"
        >
          &larr; Back to archive
        </Link>
        <h1
          className="mt-4 text-3xl font-bold tracking-[var(--letter-spacing-tight)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Ingest Film
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Select a video file and the pipeline will detect shots, classify camera movements,
          group scenes, and upload everything — all visualized in real time.
        </p>
      </div>

      {/* Form — only show when not processing */}
      {phase !== "processing" ? (
        <div
          className="space-y-6 rounded-[var(--radius-xl)] border p-6"
          style={{
            backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
            borderColor: "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          {/* File picker */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Video File
            </label>
            <div
              onClick={() => phase === "form" && fileInputRef.current?.click()}
              className="mt-2 flex cursor-pointer items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed p-8 transition-colors hover:border-[var(--color-text-accent)]"
              style={{
                borderColor: selectedFile
                  ? "var(--color-status-verified)"
                  : "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                disabled={phase !== "form"}
              />
              {selectedFile ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {selectedFile.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--color-text-tertiary)]">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  Click to select a video file
                </p>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Film Title
              </label>
              <input
                type="text"
                value={filmTitle}
                onChange={(e) => setFilmTitle(e.target.value)}
                disabled={phase !== "form"}
                placeholder="2001: A Space Odyssey"
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Director
              </label>
              <input
                type="text"
                value={director}
                onChange={(e) => setDirector(e.target.value)}
                disabled={phase !== "form"}
                placeholder="Stanley Kubrick"
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Year
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                disabled={phase !== "form"}
                placeholder="1968"
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]"
              />
            </div>
          </div>

          {/* Optional timeline window (seconds) — limits which detected shots are extracted/classified/written */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Timeline start (seconds, optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={ingestTimelineStart}
                onChange={(e) => setIngestTimelineStart(e.target.value)}
                disabled={phase !== "form"}
                placeholder="Empty or 0 = from beginning"
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]"
              />
            </div>
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Timeline end (seconds, optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={ingestTimelineEnd}
                onChange={(e) => setIngestTimelineEnd(e.target.value)}
                disabled={phase !== "form"}
                placeholder="e.g. 763.222 — empty or 0 = full length"
                className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]"
              />
            </div>
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
            Shot detection still runs on the full file; only shots overlapping this window are ingested. Leave fields
            empty or use 0 for an unset start or end (full length). Decimals: 763.222 or 763,222.
          </p>

          {/* Concurrency */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Parallel Workers: {concurrency}
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => setConcurrency(parseInt(e.target.value))}
              disabled={phase !== "form"}
              className="mt-2 w-full accent-[var(--color-interactive-default)]"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--color-text-tertiary)]">
              <span>1 (safe)</span>
              <span>20 (fast)</span>
            </div>
          </div>

          {/* Detection algorithm */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Shot Detection Algorithm
            </label>
            <p className="mt-3 max-w-prose text-xs leading-5 text-[var(--color-text-tertiary)]">
              After ingest, shots are the primary metadata grain. Set{" "}
              <code className="font-mono text-[10px]">METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene</code> on
              the server for dual PySceneDetect + NMS (Phase D). Automatic &quot;scene&quot; rows are model grouping
              for navigation only—not screenplay scenes.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setDetector("content")}
                disabled={phase !== "form"}
                className={`flex-1 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-all ${
                  detector === "content" ? "border-[var(--color-accent-base)]" : "border-[var(--color-border-default)]"
                }`}
                style={{
                  backgroundColor: detector === "content" ? "rgba(92,184,214,0.06)" : "var(--color-surface-primary)",
                }}
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Content Detector</p>
                <p className="mt-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  Faster — histogram on downscaled frames (same recipe as ingest CLI content mode, -d 4). Best when cuts are crisp;
                  weaker on busy motion.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDetector("adaptive")}
                disabled={phase !== "form"}
                className={`flex-1 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-all ${
                  detector === "adaptive" ? "border-[var(--color-signal-amber)]" : "border-[var(--color-border-default)]"
                }`}
                style={{
                  backgroundColor: detector === "adaptive" ? "rgba(214,160,92,0.06)" : "var(--color-surface-primary)",
                }}
              >
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Adaptive Detector <span className="font-normal text-[var(--color-text-tertiary)]">(default)</span>
                </p>
                <p className="mt-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  Recommended for research — rolling-window cut detection; slower but usually better when camera movement or grading
                  fights plain content mode. Run on a worker or beefy machine.
                </p>
              </button>
            </div>
          </div>

          {/* Error */}
          {uploadError ? (
            <p className="text-sm text-[var(--color-status-error)]">{uploadError}</p>
          ) : null}

          {/* Submit */}
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedFile || !filmTitle || !director || !year || phase !== "form"}
            className="w-full rounded-[var(--radius-lg)] px-6 py-3 font-mono text-sm uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-interactive-default)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            {phase === "uploading" ? "Uploading..." : "Start Ingestion"}
          </button>
        </div>
      ) : null}

      {/* Pipeline visualization */}
      {phase === "processing" && videoPath && ingestTimelineForRun ? (
        <PipelineViz
          videoPath={videoPath}
          filmTitle={filmTitle}
          director={director}
          year={parseInt(year)}
          concurrency={concurrency}
          detector={detector}
          workerUrl={workerUrl}
          ingestStartSec={ingestTimelineForRun.ingestStartSec}
          ingestEndSec={ingestTimelineForRun.ingestEndSec}
        />
      ) : null}
    </div>
  );
}
