"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { PipelineViz } from "@/components/ingest/pipeline-viz";

type IngestPhase = "form" | "uploading" | "processing";

export default function IngestPage() {
  const [phase, setPhase] = useState<IngestPhase>("form");
  const [filmTitle, setFilmTitle] = useState("");
  const [director, setDirector] = useState("");
  const [year, setYear] = useState("");
  const [concurrency, setConcurrency] = useState(5);
  const [detector, setDetector] = useState<"content" | "adaptive">("content");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL ?? "";
  const useRemoteWorker = !!workerUrl;

  async function handleStart() {
    if (!selectedFile || !filmTitle || !director || !year) return;

    setPhase("uploading");
    setUploadError(null);

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
          const err = await urlRes.json();
          throw new Error(err.error || "Failed to get upload URL");
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
          const err = await uploadRes.json();
          throw new Error(err.error || "Upload failed");
        }
        const { videoPath: path } = await uploadRes.json();
        resolvedPath = path; // local file path
      }

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
                  Fast — ~1-3 min for a full film. Good for most films. Detects hard cuts reliably.
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
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Adaptive Detector</p>
                <p className="mt-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  Slow — ~20-40 min. Better for dissolves, fades, and complex transitions. Use on a server.
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
      {phase === "processing" && videoPath ? (
        <PipelineViz
          videoPath={videoPath}
          filmTitle={filmTitle}
          director={director}
          year={parseInt(year)}
          concurrency={concurrency}
          detector={detector}
          workerUrl={workerUrl}
        />
      ) : null}
    </div>
  );
}
