"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourcedFilm = {
  title: string;
  director: string;
  year: number | null;
  sourceUrl: string;
  fileSize: number | null;
  posterUrl: string | null;
  genres: string[];
  tmdbId: number | null;
};

type StageCounts = {
  queued: number;
  running: number;
  completed: number;
  failed: number;
};

type PipelineStatus = {
  stages: Record<string, StageCounts>;
  totals: { films: number; shots: number; flaggedForReview: number };
  throughput: { shotsPerMinute: number };
  estimatedCompletion: string;
  failedJobs: Array<{
    id: string;
    stage: string;
    filmId: string;
    error: string | null;
    createdAt: string;
  }>;
};

type ReviewShot = {
  shotId: string;
  filmId: string;
  startTc: number | null;
  endTc: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
  movementType: string | null;
  shotSize: string | null;
  direction: string | null;
  speed: string | null;
  confidence: number | null;
  reviewStatus: string | null;
  validationFlags: string[] | null;
  classificationSource: string | null;
  description: string | null;
  mood: string | null;
  lighting: string | null;
  subjects: string[] | null;
};

type Tab = "submit" | "monitor" | "review";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusBadge({
  label,
  color,
}: {
  label: string | number;
  color: "green" | "cyan" | "amber" | "red" | "gray";
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
    gray: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] ${colors[color]}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Submit Batch
// ---------------------------------------------------------------------------

function SubmitTab() {
  const [phase, setPhase] = useState<"idle" | "sourcing" | "ready" | "submitting" | "done">("idle");
  const [films, setFilms] = useState<SourcedFilm[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ batchId: string; filmsQueued: number } | null>(null);

  async function handleSource() {
    setPhase("sourcing");
    setError(null);
    try {
      const res = await fetch("/api/batch/source?count=50");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Source failed: ${res.status}`);
      }
      const data: SourcedFilm[] = await res.json();
      setFilms(data);
      setChecked(new Set(data.map((_, i) => i)));
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Source failed");
      setPhase("idle");
    }
  }

  async function handleSubmit() {
    setPhase("submitting");
    setError(null);
    try {
      const selected = films.filter((_, i) => checked.has(i));
      const res = await fetch("/api/batch/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ films: selected }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Submit failed: ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
      setPhase("ready");
    }
  }

  function toggleFilm(index: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === films.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(films.map((_, i) => i)));
    }
  }

  return (
    <div className="space-y-6">
      {/* Source button */}
      {phase === "idle" && (
        <button
          onClick={handleSource}
          className="w-full rounded-[var(--radius-lg)] px-6 py-3 font-mono text-sm uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-all"
          style={{
            backgroundColor: "var(--color-interactive-default)",
            boxShadow: "var(--shadow-glow)",
          }}
        >
          Source 50 Films from Internet Archive
        </button>
      )}

      {/* Loading */}
      {phase === "sourcing" && (
        <div className="flex items-center justify-center gap-3 py-12">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
            Sourcing films from Internet Archive + TMDB enrichment...
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Film manifest */}
      {(phase === "ready" || phase === "submitting") && films.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              {checked.size} / {films.length} selected
            </span>
            <button
              onClick={toggleAll}
              className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-cyan-400 hover:text-cyan-300"
            >
              {checked.size === films.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {films.map((film, i) => (
              <div
                key={i}
                onClick={() => toggleFilm(i)}
                className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:border-cyan-500/40"
                style={{
                  borderColor: checked.has(i)
                    ? "color-mix(in oklch, var(--color-border-default) 80%, transparent)"
                    : "color-mix(in oklch, var(--color-border-default) 40%, transparent)",
                  backgroundColor: checked.has(i)
                    ? "color-mix(in oklch, var(--color-surface-secondary) 60%, transparent)"
                    : "transparent",
                }}
              >
                {/* Checkbox */}
                <div
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]"
                  style={{
                    borderColor: checked.has(i)
                      ? "var(--color-accent-base)"
                      : "var(--color-border-default)",
                    backgroundColor: checked.has(i)
                      ? "var(--color-accent-base)"
                      : "transparent",
                    color: checked.has(i) ? "var(--color-surface-primary)" : "transparent",
                  }}
                >
                  {checked.has(i) ? "\u2713" : ""}
                </div>

                {/* Poster thumbnail */}
                {film.posterUrl ? (
                  <img
                    src={film.posterUrl}
                    alt=""
                    className="h-10 w-7 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-neutral-800 font-mono text-[8px] text-neutral-500">
                    ?
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {film.title}
                  </p>
                  <p className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {film.director} {film.year ? `(${film.year})` : ""}
                  </p>
                </div>

                {/* File size */}
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-tertiary)]">
                  {formatBytes(film.fileSize)}
                </span>
              </div>
            ))}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={phase === "submitting" || checked.size === 0}
            className="w-full rounded-[var(--radius-lg)] px-6 py-3 font-mono text-sm uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-interactive-default)",
              boxShadow: "var(--shadow-glow)",
            }}
          >
            {phase === "submitting"
              ? "Submitting..."
              : `Submit ${checked.size} Films`}
          </button>
        </>
      )}

      {/* Done */}
      {phase === "done" && result && (
        <div
          className="rounded-xl border p-6 text-center"
          style={{
            borderColor: "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
            backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
          }}
        >
          <p className="text-lg font-semibold text-emerald-400">
            {result.filmsQueued} films queued for processing
          </p>
          <p className="mt-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
            Batch ID: {result.batchId}
          </p>
          <button
            onClick={() => {
              setPhase("idle");
              setFilms([]);
              setResult(null);
            }}
            className="mt-4 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-cyan-400 hover:text-cyan-300"
          >
            Source Another Batch
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Pipeline Monitor
// ---------------------------------------------------------------------------

function MonitorTab() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/batch/status");
      if (!res.ok) throw new Error(`Status fetch failed: ${res.status}`);
      const data: PipelineStatus = await res.json();
      setStatus(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (!status && !error) {
    return (
      <div className="flex items-center justify-center gap-3 py-12">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
          Loading pipeline status...
        </span>
      </div>
    );
  }

  if (error && !status) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!status) return null;

  const stageNames: Array<{ key: string; label: string }> = [
    { key: "detect", label: "Detect" },
    { key: "extract", label: "Extract" },
    { key: "classify", label: "Classify" },
    { key: "embed", label: "Embed" },
  ];

  // Overall progress
  const allCompleted = Object.values(status.stages).reduce(
    (s, v) => s + v.completed,
    0,
  );
  const allTotal = Object.values(status.stages).reduce(
    (s, v) => s + v.queued + v.running + v.completed + v.failed,
    0,
  );
  const overallPct = allTotal > 0 ? (allCompleted / allTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Overall progress */}
      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
          backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Overall Progress
          </span>
          <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            {allCompleted} / {allTotal}
          </span>
        </div>
        <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-cyan-500 transition-all duration-500"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Throughput", value: `${status.throughput.shotsPerMinute}/min` },
          { label: "ETA", value: status.estimatedCompletion },
          { label: "Films", value: status.totals.films },
          { label: "Shots", value: status.totals.shots },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border p-3 text-center"
            style={{
              borderColor: "color-mix(in oklch, var(--color-border-default) 50%, transparent)",
              backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 30%, transparent)",
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              {stat.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Stage rows */}
      <div className="space-y-2">
        {stageNames.map(({ key, label }) => {
          const stage = status.stages[key] ?? {
            queued: 0,
            running: 0,
            completed: 0,
            failed: 0,
          };
          const total =
            stage.queued + stage.running + stage.completed + stage.failed;
          const pct = total > 0 ? (stage.completed / total) * 100 : 0;

          return (
            <div
              key={key}
              className="rounded-lg border px-4 py-3"
              style={{
                borderColor: "color-mix(in oklch, var(--color-border-default) 50%, transparent)",
                backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 30%, transparent)",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]">
                  {label}
                </span>
                <div className="flex items-center gap-2">
                  {stage.queued > 0 && (
                    <StatusBadge label={`${stage.queued} queued`} color="amber" />
                  )}
                  {stage.running > 0 && (
                    <StatusBadge label={`${stage.running} running`} color="cyan" />
                  )}
                  <StatusBadge
                    label={`${stage.completed} done`}
                    color="green"
                  />
                  {stage.failed > 0 && (
                    <StatusBadge label={`${stage.failed} failed`} color="red" />
                  )}
                </div>
              </div>
              <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Failed jobs */}
      {status.failedJobs.length > 0 && (
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-red-400">
            Failed Jobs ({status.failedJobs.length})
          </h3>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {status.failedJobs.map((job) => (
              <div
                key={job.id}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge label={job.stage} color="red" />
                  <span className="truncate font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {job.filmId}
                  </span>
                </div>
                {job.error && (
                  <p className="mt-1 truncate font-mono text-[10px] text-red-300">
                    {job.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: QA Review
// ---------------------------------------------------------------------------

function ReviewTab() {
  const [shots, setShots] = useState<ReviewShot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCorrections, setShowCorrections] = useState(false);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchShots = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/batch/review?limit=20");
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data: ReviewShot[] = await res.json();
      setShots(data);
      setCurrentIndex(0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchShots();
  }, [fetchShots]);

  const current = shots[currentIndex] ?? null;

  async function handleAction(action: "approve" | "correct" | "skip") {
    if (!current) return;

    if (action === "skip") {
      advance();
      return;
    }

    try {
      const body: Record<string, unknown> = {
        shotId: current.shotId,
        action,
      };
      if (action === "correct") {
        body.corrections = corrections;
      }

      const res = await fetch("/api/batch/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Review failed");
      }

      setReviewedCount((c) => c + 1);
      setShowCorrections(false);
      setCorrections({});
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    }
  }

  function advance() {
    if (currentIndex < shots.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowCorrections(false);
      setCorrections({});
    } else {
      // Reload next batch
      fetchShots();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
          Loading review queue...
        </span>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          No shots need review right now.
        </p>
      </div>
    );
  }

  if (!current) return null;

  const correctionFields = [
    { key: "movementType", label: "Movement Type", current: current.movementType },
    { key: "shotSize", label: "Shot Size", current: current.shotSize },
    { key: "direction", label: "Direction", current: current.direction },
    { key: "speed", label: "Speed", current: current.speed },
    { key: "description", label: "Description", current: current.description },
    { key: "mood", label: "Mood", current: current.mood },
  ];

  return (
    <div className="space-y-6">
      {/* Counter */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Reviewed {reviewedCount} / {shots.length} flagged shots
        </span>
        <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {currentIndex + 1} of {shots.length}
        </span>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Shot card */}
      <div
        className="rounded-xl border p-6"
        style={{
          borderColor: "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
          backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
        }}
      >
        {/* Description */}
        <p className="text-sm text-[var(--color-text-primary)]">
          {current.description || "No description available"}
        </p>

        {/* Badges */}
        <div className="mt-4 flex flex-wrap gap-2">
          {current.movementType && (
            <StatusBadge label={current.movementType} color="cyan" />
          )}
          {current.shotSize && (
            <StatusBadge label={current.shotSize} color="cyan" />
          )}
          {current.direction && current.direction !== "none" && (
            <StatusBadge label={current.direction} color="gray" />
          )}
          {current.speed && (
            <StatusBadge label={current.speed} color="gray" />
          )}
          {current.duration != null && (
            <StatusBadge
              label={`${current.duration.toFixed(1)}s`}
              color="gray"
            />
          )}
          {current.confidence != null && (
            <StatusBadge
              label={`${(current.confidence * 100).toFixed(0)}%`}
              color={current.confidence > 0.7 ? "green" : "amber"}
            />
          )}
        </div>

        {/* Metadata details */}
        <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          {current.mood && (
            <div>
              <span className="uppercase">Mood:</span> {current.mood}
            </div>
          )}
          {current.lighting && (
            <div>
              <span className="uppercase">Lighting:</span> {current.lighting}
            </div>
          )}
          {current.subjects && current.subjects.length > 0 && (
            <div className="col-span-2">
              <span className="uppercase">Subjects:</span>{" "}
              {current.subjects.join(", ")}
            </div>
          )}
          {current.classificationSource && (
            <div>
              <span className="uppercase">Source:</span>{" "}
              {current.classificationSource}
            </div>
          )}
        </div>

        {/* Validation flags */}
        {current.validationFlags && current.validationFlags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {current.validationFlags.map((flag) => (
              <StatusBadge key={flag} label={flag} color="amber" />
            ))}
          </div>
        )}
      </div>

      {/* Correction form */}
      {showCorrections && (
        <div
          className="space-y-3 rounded-xl border p-4"
          style={{
            borderColor: "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
            backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 30%, transparent)",
          }}
        >
          <h3 className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-amber-400">
            Corrections
          </h3>
          {correctionFields.map((field) => (
            <div key={field.key}>
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                {field.label}
              </label>
              <input
                type="text"
                placeholder={field.current ?? ""}
                value={corrections[field.key] ?? ""}
                onChange={(e) =>
                  setCorrections((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-amber-500"
              />
            </div>
          ))}
          <button
            onClick={() => handleAction("correct")}
            className="mt-2 w-full rounded-[var(--radius-md)] bg-amber-500/20 px-4 py-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-amber-400 transition-colors hover:bg-amber-500/30"
          >
            Submit Corrections
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => handleAction("approve")}
          className="rounded-[var(--radius-md)] bg-emerald-500/20 px-4 py-3 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-emerald-400 transition-colors hover:bg-emerald-500/30"
        >
          Approve
        </button>
        <button
          onClick={() => setShowCorrections(!showCorrections)}
          className="rounded-[var(--radius-md)] bg-amber-500/20 px-4 py-3 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-amber-400 transition-colors hover:bg-amber-500/30"
        >
          Correct
        </button>
        <button
          onClick={() => handleAction("skip")}
          className="rounded-[var(--radius-md)] bg-neutral-500/20 px-4 py-3 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-neutral-400 transition-colors hover:bg-neutral-500/30"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("submit");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "submit", label: "Submit Batch" },
    { key: "monitor", label: "Pipeline Monitor" },
    { key: "review", label: "QA Review" },
  ];

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
          Admin
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Batch pipeline management — source films, monitor processing, and review classifications.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-[var(--radius-md)] px-4 py-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] transition-all ${
              activeTab === tab.key
                ? "bg-cyan-500/20 text-cyan-400"
                : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        className="rounded-xl border p-6"
        style={{
          borderColor: "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
          backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 40%, transparent)",
        }}
      >
        {activeTab === "submit" && <SubmitTab />}
        {activeTab === "monitor" && <MonitorTab />}
        {activeTab === "review" && <ReviewTab />}
      </div>
    </div>
  );
}
