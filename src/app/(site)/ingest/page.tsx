"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { PipelineViz } from "@/components/ingest/pipeline-viz";
import { TmdbTitleSearch } from "@/components/ingest/tmdb-title-search";
import { normalizeS3SourceReuseInput } from "@/lib/s3-source-reuse";

type IngestPhase = "form" | "uploading" | "processing";

const LAST_SOURCE_S3_KEY = "metrovision_ingest_last_source_s3_key";

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
    ? " Configure AWS S3 env vars on this deployment so the app can mint presigned URLs (browser uploads directly to S3), or run ingest locally / with a worker."
    : "";
}

/** `fetch` does not surface upload progress; XHR does (critical for large S3 PUTs). */
function putFileWithProgress(
  url: string,
  file: File,
  contentType: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);

    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort);

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error while uploading to storage."));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    xhr.send(file);
  });
}

function postFormDataWithProgress(
  url: string,
  formData: FormData,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort);

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText);
      } else {
        const t = xhr.responseText?.trim() ?? "";
        let msg = `Request failed (HTTP ${xhr.status})`;
        try {
          const j = JSON.parse(t) as { error?: string };
          if (typeof j.error === "string" && j.error.trim()) msg = j.error.trim();
        } catch {
          if (t) msg = t.replace(/\s+/g, " ").slice(0, 300);
        }
        reject(new Error(msg + uploadSizeHint(xhr.status, msg)));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error while uploading to the server."));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    xhr.send(formData);
  });
}

export default function IngestPage() {
  const [phase, setPhase] = useState<IngestPhase>("form");
  const [filmTitle, setFilmTitle] = useState("");
  const [director, setDirector] = useState("");
  const [year, setYear] = useState("");
  const [concurrency, setConcurrency] = useState(5);
  const [ingestTimelineStart, setIngestTimelineStart] = useState("");
  const [ingestTimelineEnd, setIngestTimelineEnd] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  /** When set, Start skips browser → S3 upload and re-presigns this source object instead. */
  const [reuseSourceKey, setReuseSourceKey] = useState("");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  /** Set when a run starts (after upload succeeds) so the pipeline request includes optional timeline bounds. */
  const [ingestTimelineForRun, setIngestTimelineForRun] = useState<{
    ingestStartSec?: number;
    ingestEndSec?: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Shown under the start button while phase === "uploading". */
  const [uploadStageMessage, setUploadStageMessage] = useState<string | null>(null);
  /** Byte progress during Step 2 (XHR upload). */
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadProgressThrottleRef = useRef(0);

  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL ?? "";

  const [lastSourceKeyAvailable, setLastSourceKeyAvailable] = useState(false);

  useEffect(() => {
    try {
      setLastSourceKeyAvailable(Boolean(sessionStorage.getItem(LAST_SOURCE_S3_KEY)?.trim()));
    } catch {
      setLastSourceKeyAvailable(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  function handleCancelUpload() {
    uploadAbortRef.current?.abort();
  }

  async function handleStart() {
    if (!filmTitle || !director || !year) return;

    const yearNum = parseInt(year, 10);
    if (!Number.isFinite(yearNum)) {
      setUploadError("Enter a valid release year (e.g. 1968).");
      return;
    }

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

    const ac = new AbortController();
    uploadAbortRef.current = ac;
    const { signal } = ac;

    const trimmedReuse = normalizeS3SourceReuseInput(reuseSourceKey);

    if (trimmedReuse) {
      setPhase("uploading");
      setUploadError(null);
      setUploadProgress(null);
      setUploadStageMessage("Skipping upload — minting a fresh download URL for your existing S3 source…");
      setIngestTimelineForRun(null);
      try {
        const reuseRes = await fetch("/api/s3/presign-get", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmedReuse }),
          signal,
        });
        if (!reuseRes.ok) {
          const msg = await readFetchErrorMessage(reuseRes);
          throw new Error(msg);
        }
        const { videoUrl } = (await reuseRes.json()) as { videoUrl?: string };
        if (!videoUrl?.trim()) {
          throw new Error("Presign response missing videoUrl.");
        }
        setIngestTimelineForRun({ ingestStartSec, ingestEndSec });
        setVideoPath(videoUrl);
        setPhase("processing");
        setUploadStageMessage(null);
        setUploadProgress(null);
      } catch (error) {
        const aborted =
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError");
        if (aborted) {
          setUploadError("Cancelled.");
        } else {
          const message = error instanceof Error ? error.message : "Reuse presign failed";
          setUploadError(message);
        }
        setPhase("form");
        setUploadStageMessage(null);
        setUploadProgress(null);
      } finally {
        uploadAbortRef.current = null;
      }
      return;
    }

    if (!selectedFile) {
      setUploadError("Select a video file, or paste an S3 source key below to skip upload.");
      return;
    }

    setPhase("uploading");
    setUploadError(null);
    setUploadProgress(null);
    uploadProgressThrottleRef.current = 0;
    setUploadStageMessage("Step 1 of 2: Requesting a direct upload URL from the app…");
    setIngestTimelineForRun(null);

    const fileMb = (selectedFile.size / 1024 / 1024).toFixed(1);

    const emitUploadProgress = (loaded: number, total: number) => {
      const now = Date.now();
      const done = total > 0 && loaded >= total;
      if (!done && now - uploadProgressThrottleRef.current < 200) return;
      uploadProgressThrottleRef.current = now;
      setUploadProgress({ loaded, total });
    };

    try {
      let resolvedPath: string;

      const presignRes = await fetch("/api/upload-to-s3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type || "video/mp4",
          filmTitle,
          year,
        }),
        signal,
      });

      if (presignRes.ok) {
        setUploadStageMessage(
          `Step 2 of 2: Uploading ${fileMb} MB directly to cloud storage (browser → S3). Progress below updates as bytes are sent.`,
        );
        const { putUrl, videoUrl, s3Key } = (await presignRes.json()) as {
          putUrl: string;
          videoUrl: string;
          s3Key?: string;
        };
        if (typeof s3Key === "string" && s3Key.trim()) {
          try {
            sessionStorage.setItem(LAST_SOURCE_S3_KEY, s3Key.trim());
            setLastSourceKeyAvailable(true);
          } catch {
            /* private mode */
          }
        }
        setUploadProgress({ loaded: 0, total: selectedFile.size });
        await putFileWithProgress(
          putUrl,
          selectedFile,
          selectedFile.type || "video/mp4",
          signal,
          emitUploadProgress,
        );
        setUploadProgress({ loaded: selectedFile.size, total: selectedFile.size });
        resolvedPath = videoUrl;
      } else {
        const presignErr = await readFetchErrorMessage(presignRes);
        if (presignRes.status >= 400 && presignRes.status < 500) {
          throw new Error(presignErr);
        }
        setUploadStageMessage(
          `Step 2 of 2: Uploading ${fileMb} MB through the app server (fallback). Progress below updates as bytes are sent.`,
        );
        const formData = new FormData();
        formData.append("video", selectedFile);
        setUploadProgress({ loaded: 0, total: selectedFile.size });
        const responseText = await postFormDataWithProgress(
          "/api/upload-video",
          formData,
          signal,
          emitUploadProgress,
        );
        const { videoPath: path } = JSON.parse(responseText) as { videoPath: string };
        setUploadProgress({ loaded: selectedFile.size, total: selectedFile.size });
        resolvedPath = path;
      }

      setUploadStageMessage("Upload complete. Starting ingest pipeline…");
      setIngestTimelineForRun({ ingestStartSec, ingestEndSec });
      setVideoPath(resolvedPath);
      setPhase("processing");
      setUploadStageMessage(null);
      setUploadProgress(null);
    } catch (error) {
      const aborted =
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");
      if (aborted) {
        setUploadError("Upload cancelled.");
      } else {
        const message = error instanceof Error ? error.message : "Upload failed";
        setUploadError(message);
      }
      setPhase("form");
      setUploadStageMessage(null);
      setUploadProgress(null);
    } finally {
      uploadAbortRef.current = null;
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
          Select a video file and the pipeline will detect shots, classify composition metadata (framing,
          depth, scale, lighting cues, and related fields), group scenes, and upload assets — visualized in
          real time.
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
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
              Optional: skip upload if this file is already in S3 (see below).
            </p>
          </div>

          {/* Reuse existing source on S3 (faster re-testing) */}
          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              borderColor: "color-mix(in oklch, var(--color-border-default) 70%, transparent)",
              backgroundColor: "color-mix(in oklch, var(--color-surface-primary) 92%, transparent)",
            }}
          >
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Skip upload — S3 source key
            </label>
            <textarea
              value={reuseSourceKey}
              onChange={(e) => setReuseSourceKey(e.target.value)}
              disabled={phase !== "form"}
              placeholder="films/your-film-slug/source/1234567890-filename.mp4"
              rows={2}
              className="mt-2 w-full resize-y rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {lastSourceKeyAvailable ? (
                <button
                  type="button"
                  disabled={phase !== "form"}
                  onClick={() => {
                    try {
                      const k = sessionStorage.getItem(LAST_SOURCE_S3_KEY)?.trim() ?? "";
                      if (k) setReuseSourceKey(k);
                    } catch {
                      /* */
                    }
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-transparent px-3 py-1.5 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-text-accent)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
                >
                  Use last uploaded source
                </button>
              ) : null}
              {reuseSourceKey.trim() ? (
                <button
                  type="button"
                  disabled={phase !== "form"}
                  onClick={() => setReuseSourceKey("")}
                  className="rounded-[var(--radius-md)] border border-transparent px-3 py-1.5 font-mono text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                >
                  Clear key
                </button>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
              Paste the object key (<code className="text-[var(--color-text-secondary)]">s3Key</code>), a full presigned S3 URL, or a JSON blob from the Network response.
              Click <span className="text-[var(--color-text-secondary)]">Use last uploaded source</span> after one normal upload in this browser. If this field has
              text, Start skips PUT upload and only re-mints a GET URL (Vercel and worker must use the same bucket/credentials as the upload).
            </p>
          </div>

          {/* Metadata — title search fills director + year from TMDB */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <TmdbTitleSearch
                title={filmTitle}
                onTitleChange={setFilmTitle}
                onPickFilm={(f) => {
                  setFilmTitle(f.title);
                  setDirector(f.director);
                  setYear(f.year);
                }}
                disabled={phase !== "form"}
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

          <p className="max-w-prose font-mono text-[10px] leading-relaxed text-[var(--color-text-tertiary)]">
            Shot boundaries use PySceneDetect adaptive mode. For dual-detector + NMS on the server, set{" "}
            <code className="font-mono text-[10px]">METROVISION_BOUNDARY_DETECTOR=pyscenedetect_ensemble_pyscene</code>.
            Automatic scene rows are model grouping for navigation only.
          </p>

          {/* Error */}
          {uploadError ? (
            <p className="text-sm text-[var(--color-status-error)]">{uploadError}</p>
          ) : null}

          {/* Submit */}
          <button
            type="button"
            onClick={handleStart}
            disabled={
              phase !== "form" ||
              !filmTitle ||
              !director ||
              !year ||
              (!selectedFile && !reuseSourceKey.trim())
            }
            className="w-full rounded-[var(--radius-lg)] px-6 py-3 font-mono text-sm uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-interactive-default)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            {phase === "uploading" ? (reuseSourceKey.trim() ? "Preparing…" : "Uploading…") : "Start Ingestion"}
          </button>

          {phase === "uploading" && uploadStageMessage ? (
            <div
              className="space-y-3 rounded-[var(--radius-md)] border p-4"
              style={{
                borderColor: "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                backgroundColor: "color-mix(in oklch, var(--color-surface-primary) 88%, transparent)",
              }}
            >
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{uploadStageMessage}</p>
              {uploadProgress && uploadProgress.total > 0 ? (
                <div className="space-y-2">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: "color-mix(in oklch, var(--color-border-default) 85%, transparent)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-200 ease-out"
                      style={{
                        width: `${Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))}%`,
                        backgroundColor: "var(--color-interactive-default)",
                      }}
                    />
                  </div>
                  <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {(uploadProgress.loaded / 1024 / 1024).toFixed(1)} / {(uploadProgress.total / 1024 / 1024).toFixed(1)}{" "}
                    MB sent ({Math.min(100, Math.round((uploadProgress.loaded / uploadProgress.total) * 100))}%)
                  </p>
                </div>
              ) : null}
              {uploadProgress && uploadProgress.total === 0 && uploadProgress.loaded > 0 ? (
                <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  {(uploadProgress.loaded / 1024 / 1024).toFixed(1)} MB sent (total size unknown)
                </p>
              ) : null}
              {uploadProgress ? (
                <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  If the percentage stays at 0% for a long time, your network or browser may be buffering the start of the
                  upload. If it never moves, cancel and try a different network or VPN.
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleCancelUpload}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-status-error)] hover:text-[var(--color-status-error)]"
              >
                Cancel upload
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Pipeline visualization */}
      {phase === "processing" && videoPath && ingestTimelineForRun ? (
        <PipelineViz
          videoPath={videoPath}
          filmTitle={filmTitle}
          director={director}
          year={parseInt(year, 10)}
          concurrency={concurrency}
          workerUrl={workerUrl}
          ingestStartSec={ingestTimelineForRun.ingestStartSec}
          ingestEndSec={ingestTimelineForRun.ingestEndSec}
        />
      ) : null}
    </div>
  );
}
