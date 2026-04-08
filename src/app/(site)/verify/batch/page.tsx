"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  BlockingTypeSlug,
  DepthTypeSlug,
  FramingSlug,
  ShotSizeSlug,
} from "@/lib/taxonomy";
import {
  getFramingDisplayName,
  getShotSizeDisplayName,
  getDepthDisplayName,
  getBlockingDisplayName,
} from "@/lib/shot-display";
import { getClassificationSourceLabel } from "@/lib/verification";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BatchShot = {
  shotId: string;
  filmId: string;
  filmTitle: string;
  filmDirector: string;
  startTc: number | null;
  endTc: number | null;
  duration: number | null;
  thumbnailUrl: string | null;
  framing: string;
  shotSize: string | null;
  depth: string | null;
  blocking: string | null;
  confidence: number | null;
  reviewStatus: string | null;
  classificationSource: string | null;
  description: string | null;
  mood: string | null;
  lighting: string | null;
  subjects: string[] | null;
};

type FilmOption = { id: string; title: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 40;
const BATCH_FILTERS_STORAGE_KEY = "metrovision:verify-batch-filters";
const LONG_TAKE_SEC = 12;
type SortMode = "priority" | "confidence";

const REVIEW_STATUS_OPTIONS = [
  { value: "", label: "Needs review (default)" },
  { value: "needs_review", label: "Needs review" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "human_verified", label: "Human verified" },
  { value: "human_corrected", label: "Human corrected" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BatchReviewPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  // Data
  const [shots, setShots] = useState<BatchShot[]>([]);
  const [films, setFilms] = useState<FilmOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filmId, setFilmId] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [confidenceMin, setConfidenceMin] = useState("");
  const [confidenceMax, setConfidenceMax] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  // Pagination
  const [offset, setOffset] = useState(0);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Action state
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // -------------------------------------------------------------------------
  // URL + localStorage (initial hydrate once)
  // -------------------------------------------------------------------------

  useLayoutEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.toString()) {
      setFilmId(sp.get("filmId") ?? "");
      setReviewStatus(sp.get("reviewStatus") ?? "");
      setConfidenceMin(sp.get("confidenceMin") ?? "");
      setConfidenceMax(sp.get("confidenceMax") ?? "");
      setSortMode(sp.get("sort") === "confidence" ? "confidence" : "priority");
      const off = parseInt(sp.get("offset") ?? "0", 10);
      setOffset(Number.isFinite(off) && off >= 0 ? off : 0);
    } else {
      try {
        const raw = localStorage.getItem(BATCH_FILTERS_STORAGE_KEY);
        if (raw) {
          const j = JSON.parse(raw) as Record<string, unknown>;
          if (typeof j.filmId === "string") setFilmId(j.filmId);
          if (typeof j.reviewStatus === "string") setReviewStatus(j.reviewStatus);
          if (typeof j.confidenceMin === "string") setConfidenceMin(j.confidenceMin);
          if (typeof j.confidenceMax === "string") setConfidenceMax(j.confidenceMax);
          if (j.sortMode === "confidence" || j.sortMode === "priority") {
            setSortMode(j.sortMode);
          }
          const off =
            typeof j.offset === "number" && j.offset >= 0 ? Math.floor(j.offset) : 0;
          setOffset(off);
        }
      } catch {
        /* ignore */
      }
    }
    setFiltersHydrated(true);
  }, []);

  useEffect(() => {
    if (!filtersHydrated) return;
    const p = new URLSearchParams();
    if (filmId) p.set("filmId", filmId);
    if (reviewStatus) p.set("reviewStatus", reviewStatus);
    if (confidenceMin) p.set("confidenceMin", confidenceMin);
    if (confidenceMax) p.set("confidenceMax", confidenceMax);
    if (sortMode !== "priority") p.set("sort", sortMode);
    if (offset > 0) p.set("offset", String(offset));
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
    try {
      localStorage.setItem(
        BATCH_FILTERS_STORAGE_KEY,
        JSON.stringify({
          filmId,
          reviewStatus,
          confidenceMin,
          confidenceMax,
          sortMode,
          offset,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [
    filtersHydrated,
    pathname,
    router,
    filmId,
    reviewStatus,
    confidenceMin,
    confidenceMax,
    sortMode,
    offset,
  ]);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchShots = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (filmId) params.set("filmId", filmId);
    if (reviewStatus) params.set("reviewStatus", reviewStatus);
    if (confidenceMin) params.set("confidenceMin", confidenceMin);
    if (confidenceMax) params.set("confidenceMax", confidenceMax);
    if (sortMode !== "priority") params.set("sort", sortMode);

    try {
      const res = await fetch(`/api/batch/review?${params}`);
      const data = await res.json();
      setShots(data.rows ?? []);
      setTotal(data.total ?? 0);
      setFilms(data.films ?? []);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [offset, filmId, reviewStatus, confidenceMin, confidenceMax, sortMode]);

  useEffect(() => {
    fetchShots();
  }, [fetchShots]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function approveOne(shotId: string) {
    setApproving((prev) => new Set(prev).add(shotId));
    try {
      const res = await fetch("/api/batch/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotId, action: "approve" }),
      });
      if (res.ok) {
        setApproved((prev) => new Set(prev).add(shotId));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(shotId);
          return next;
        });
      }
    } finally {
      setApproving((prev) => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
    }
  }

  async function bulkApprove() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkApproving(true);
    try {
      const res = await fetch("/api/batch/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotIds: ids, action: "approve" }),
      });
      if (res.ok) {
        setApproved((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        });
        setSelected(new Set());
      }
    } finally {
      setBulkApproving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Selection helpers
  // -------------------------------------------------------------------------

  function toggleSelect(shotId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(shotId)) next.delete(shotId);
      else next.add(shotId);
      return next;
    });
  }

  function selectAll() {
    const selectable = shots
      .filter((s) => !approved.has(s.shotId))
      .map((s) => s.shotId);
    setSelected(new Set(selectable));
  }

  function selectNone() {
    setSelected(new Set());
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Batch verification workflow
          </p>
          <h1
            className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Batch review
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            Rapidly approve or flag shots in bulk. Designed for scaling review across 500+ films.
          </p>
        </div>
        <Link
          href="/verify"
          className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          Single review queue
        </Link>
      </section>

      {/* Filters */}
      <section
        className="flex flex-wrap items-end gap-3 rounded-[var(--radius-xl)] border p-4"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Film
          </label>
          <select
            value={filmId}
            onChange={(e) => {
              setFilmId(e.target.value);
              setOffset(0);
            }}
            className="h-7 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">All films</option>
            {films.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Status
          </label>
          <select
            value={reviewStatus}
            onChange={(e) => {
              setReviewStatus(e.target.value);
              setOffset(0);
            }}
            className="h-7 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
          >
            {REVIEW_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Confidence min
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="0.0"
            value={confidenceMin}
            onChange={(e) => {
              setConfidenceMin(e.target.value);
              setOffset(0);
            }}
            className="h-7 w-20 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Confidence max
          </label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="1.0"
            value={confidenceMax}
            onChange={(e) => {
              setConfidenceMax(e.target.value);
              setOffset(0);
            }}
            className="h-7 w-20 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Sort
          </label>
          <select
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value === "confidence" ? "confidence" : "priority");
              setOffset(0);
            }}
            className="h-7 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
          >
            <option value="priority">Priority (fallback, long, confidence)</option>
            <option value="confidence">Confidence (legacy)</option>
          </select>
        </div>

        <div className="ml-auto flex items-end gap-2">
          <p className="font-mono text-xs text-[var(--color-text-tertiary)]">
            {total} shot{total !== 1 ? "s" : ""} matched
          </p>
        </div>
      </section>

      {/* Bulk actions bar */}
      <section className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="xs" onClick={selectAll}>
          Select all
        </Button>
        <Button variant="ghost" size="xs" onClick={selectNone}>
          Clear selection
        </Button>

        {selected.size > 0 && (
          <Button
            variant="default"
            size="sm"
            onClick={bulkApprove}
            disabled={bulkApproving}
            className="rounded-full px-4"
            style={{
              backgroundColor: "var(--color-status-verified)",
              color: "var(--color-surface-primary)",
            }}
          >
            {bulkApproving ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Check />
            )}
            Approve {selected.size} selected
          </Button>
        )}

        <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
          {selected.size} selected
        </span>
      </section>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-[var(--color-text-tertiary)]" />
        </div>
      ) : shots.length === 0 ? (
        <section
          className="rounded-[var(--radius-xl)] border border-dashed p-8 text-center"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 54%, transparent)",
          }}
        >
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-status-verified)]">
            No shots found
          </p>
          <h2
            className="mt-4 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            No shots match the current filters
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
            Try adjusting the film, confidence, or status filters above.
          </p>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shots.map((shot) => {
            const isApproved = approved.has(shot.shotId);
            const isApproving = approving.has(shot.shotId);
            const isSelected = selected.has(shot.shotId);
            const isFallback = shot.classificationSource === "gemini_fallback";
            const isLongTake =
              shot.duration != null && Number.isFinite(shot.duration) && shot.duration >= LONG_TAKE_SEC;
            const isLowConf =
              shot.confidence !== null &&
              Number.isFinite(shot.confidence) &&
              shot.confidence < 0.5;

            return (
              <div
                key={shot.shotId}
                className="group relative overflow-hidden rounded-[var(--radius-xl)] border transition-all"
                style={{
                  background: isApproved
                    ? "color-mix(in oklch, var(--color-status-verified) 8%, var(--color-surface-secondary))"
                    : "color-mix(in oklch, var(--color-surface-secondary) 82%, transparent)",
                  borderColor: isSelected
                    ? "var(--color-accent-base)"
                    : isApproved
                      ? "color-mix(in oklch, var(--color-status-verified) 42%, transparent)"
                      : "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                  opacity: isApproved ? 0.6 : 1,
                }}
              >
                {/* Checkbox overlay */}
                <button
                  type="button"
                  onClick={() => !isApproved && toggleSelect(shot.shotId)}
                  className="absolute left-2 top-2 z-10 flex size-5 items-center justify-center rounded border transition-colors"
                  style={{
                    backgroundColor: isSelected
                      ? "var(--color-accent-base)"
                      : "color-mix(in oklch, var(--color-surface-primary) 82%, transparent)",
                    borderColor: isSelected
                      ? "var(--color-accent-base)"
                      : "var(--color-border-default)",
                  }}
                  aria-label={isSelected ? "Deselect shot" : "Select shot"}
                >
                  {isSelected && (
                    <Check className="size-3 text-[var(--color-surface-primary)]" />
                  )}
                </button>

                {/* Thumbnail */}
                <div className="relative aspect-video overflow-hidden border-b border-[var(--color-border-subtle)]">
                  {shot.thumbnailUrl ? (
                    <Image
                      alt=""
                      aria-hidden="true"
                      src={shot.thumbnailUrl}
                      fill
                      sizes="(min-width: 1280px) 280px, (min-width: 1024px) 320px, (min-width: 640px) 360px, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-[var(--color-surface-tertiary)]">
                      <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
                        No thumbnail
                      </span>
                    </div>
                  )}

                  {/* Confidence badge */}
                  <span
                    className="absolute right-2 top-2 rounded-full border px-2 py-0.5 font-mono text-[10px]"
                    style={{
                      backgroundColor:
                        "color-mix(in oklch, var(--color-surface-primary) 82%, transparent)",
                      borderColor:
                        "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
                      color:
                        shot.confidence !== null && shot.confidence < 0.5
                          ? "var(--color-signal-amber)"
                          : "var(--color-text-secondary)",
                    }}
                  >
                    {shot.confidence !== null
                      ? `${(shot.confidence * 100).toFixed(0)}%`
                      : "N/A"}
                  </span>

                  {/* Approved overlay */}
                  {isApproved && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Check className="size-8 text-[var(--color-status-verified)]" />
                    </div>
                  )}
                </div>

                {(isFallback || isLongTake || isLowConf) && (
                  <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border-subtle)] px-3 py-2">
                    {isFallback ? (
                      <span className="rounded-full border border-[var(--color-signal-amber)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-signal-amber)]">
                        Fallback
                      </span>
                    ) : null}
                    {isLongTake ? (
                      <span className="rounded-full border border-[var(--color-accent-base)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                        Long take
                      </span>
                    ) : null}
                    {isLowConf ? (
                      <span className="rounded-full border border-[var(--color-border-default)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-signal-amber)]">
                        Low conf
                      </span>
                    ) : null}
                  </div>
                )}

                {/* Classification fields */}
                <div className="space-y-2 px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-primary)]">
                      {getFramingDisplayName(shot.framing as FramingSlug)}
                    </span>
                    {shot.shotSize && (
                      <span className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                        {getShotSizeDisplayName(shot.shotSize as ShotSizeSlug)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {shot.depth && (
                      <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                        {getDepthDisplayName(shot.depth as DepthTypeSlug)}
                      </span>
                    )}
                    {shot.blocking && (
                      <>
                        <span className="text-[var(--color-text-tertiary)]">/</span>
                        <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                          {getBlockingDisplayName(shot.blocking as BlockingTypeSlug)}
                        </span>
                      </>
                    )}
                  </div>

                  <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {shot.filmTitle} &middot; {shot.filmDirector}
                  </p>

                  {shot.description && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      {shot.description}
                    </p>
                  )}

                  <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {getClassificationSourceLabel(shot.classificationSource)}
                    {shot.duration ? ` / ${shot.duration.toFixed(1)}s` : ""}
                  </p>
                </div>

                {/* Action buttons */}
                {!isApproved && (
                  <div className="flex border-t border-[var(--color-border-subtle)]">
                    <button
                      type="button"
                      onClick={() => approveOne(shot.shotId)}
                      disabled={isApproving}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors hover:bg-[var(--color-surface-tertiary)]"
                      style={{ color: "var(--color-status-verified)" }}
                    >
                      {isApproving ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}
                      Approve
                    </button>
                    <div className="w-px bg-[var(--color-border-subtle)]" />
                    <Link
                      href={`/verify/${shot.shotId}`}
                      className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium text-[var(--color-signal-amber)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
                    >
                      <Flag className="size-3" />
                      Detail review
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <section className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="rounded-full"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </Button>
          <span className="font-mono text-xs text-[var(--color-text-tertiary)]">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="rounded-full"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </section>
      )}
    </div>
  );
}
