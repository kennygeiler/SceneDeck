"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  BOUNDARY_TRIAGE_CLUSTERS,
  boundaryClusterLabel,
  type BoundaryTriageCluster,
} from "@/lib/boundary-triage-cluster";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BoundaryRow = {
  shotId: string;
  filmId: string;
  filmTitle: string;
  startTc: number | null;
  prevShotId: string | null;
  prevThumbnailUrl: string | null;
  thumbnailUrl: string | null;
  confidence: number | null;
  reviewStatus: string;
  classificationSource: string | null;
  techniqueNotes: string | null;
  description: string | null;
  cluster: Exclude<BoundaryTriageCluster, "all">;
};

type FilmOption = { id: string; title: string };

const STORAGE_KEY = "metrovision:boundary-triage";

const ROW_GAP = 12;
const ROW_BASE = 200;

function useGridColumns(): number {
  const [cols, setCols] = useState(4);
  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(4);
      else if (w >= 900) setCols(3);
      else if (w >= 640) setCols(2);
      else setCols(1);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return cols;
}

function rectsIntersect(
  a: DOMRect,
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function ThumbPair({
  prevUrl,
  nextUrl,
  labelBefore,
  labelAfter,
}: {
  prevUrl: string | null;
  nextUrl: string | null;
  labelBefore: string;
  labelAfter: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <div className="relative aspect-video overflow-hidden rounded-md bg-[var(--color-surface-tertiary)]">
        {prevUrl ? (
          // Virtualized grid: native img avoids Next Image layout work per cell.
          // eslint-disable-next-line @next/next/no-img-element -- virtualized boundary triage (500+ thumbs)
          <img
            src={prevUrl}
            alt={labelBefore}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full items-center justify-center px-1 text-center font-mono text-[9px] text-[var(--color-text-tertiary)]">
            Film start
          </div>
        )}
      </div>
      <div className="relative aspect-video overflow-hidden rounded-md bg-[var(--color-surface-tertiary)]">
        {nextUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- virtualized boundary triage (500+ thumbs)
          <img
            src={nextUrl}
            alt={labelAfter}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full items-center justify-center font-mono text-[9px] text-[var(--color-text-tertiary)]">
            No frame
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export function BoundaryTriageWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const cols = useGridColumns();

  const [hydrated, setHydrated] = useState(false);
  const [filmId, setFilmId] = useState("");
  const [clusterTab, setClusterTab] = useState<BoundaryTriageCluster>("all");
  const [confidenceMaxPct, setConfidenceMaxPct] = useState(100);
  const [sliderActive, setSliderActive] = useState(false);

  const [rawRows, setRawRows] = useState<BoundaryRow[]>([]);
  const [films, setFilms] = useState<FilmOption[]>([]);
  const [totalRemote, setTotalRemote] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState<"approve" | "reject" | null>(null);

  const [hotCardId, setHotCardId] = useState<string | null>(null);
  const anchorIndexRef = useRef<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  /** Pick first film with queued cuts once, so the grid is not empty when no film is in URL/storage. */
  const didAutoPickFilm = useRef(false);
  const lassoRef = useRef<{
    active: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    pointerId: number;
  } | null>(null);
  const [lassoUi, setLassoUi] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // URL + localStorage hydrate
  useLayoutEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const fid = sp.get("filmId") ?? "";
    if (fid) setFilmId(fid);
    else {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const j = JSON.parse(raw) as { filmId?: string };
          if (typeof j.filmId === "string") setFilmId(j.filmId);
        }
      } catch {
        /* ignore */
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const p = new URLSearchParams();
    if (filmId) p.set("filmId", filmId);
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`, { scroll: false });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ filmId }));
    } catch {
      /* ignore */
    }
  }, [hydrated, pathname, router, filmId]);

  const fetchRows = useCallback(async (fid: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = fid
        ? `/api/batch/boundary-triage?filmId=${encodeURIComponent(fid)}&limit=500`
        : "/api/batch/boundary-triage";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Load failed");
      setFilms(data.films ?? []);
      if (!fid) {
        setRawRows([]);
        setTotalRemote(0);
        const list = (data.films ?? []) as FilmOption[];
        if (list.length > 0 && !didAutoPickFilm.current) {
          didAutoPickFilm.current = true;
          setFilmId(list[0]!.id);
        }
      } else {
        setRawRows(data.rows ?? []);
        setTotalRemote(data.total ?? 0);
        setRemoved(new Set());
        setSelected(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void fetchRows(filmId);
  }, [hydrated, filmId, fetchRows]);

  const activeRows = useMemo(
    () => rawRows.filter((r) => !removed.has(r.shotId)),
    [rawRows, removed],
  );

  const filteredRows = useMemo(() => {
    return activeRows.filter((r) => {
      if (clusterTab !== "all" && r.cluster !== clusterTab) return false;
      if (r.confidence === null) return true;
      return r.confidence * 100 <= confidenceMaxPct + 1e-6;
    });
  }, [activeRows, clusterTab, confidenceMaxPct]);

  const clusterCounts = useMemo(() => {
    const c: Record<string, number> = { all: activeRows.length };
    for (const k of BOUNDARY_TRIAGE_CLUSTERS) {
      if (k !== "all") c[k] = 0;
    }
    for (const r of activeRows) {
      c[r.cluster] = (c[r.cluster] ?? 0) + 1;
    }
    return c as Record<BoundaryTriageCluster | string, number>;
  }, [activeRows]);

  const rowChunks = useMemo(() => {
    const chunks: BoundaryRow[][] = [];
    for (let i = 0; i < filteredRows.length; i += cols) {
      chunks.push(filteredRows.slice(i, i + cols));
    }
    return chunks;
  }, [filteredRows, cols]);

  const rowVirtualizer = useVirtualizer({
    count: rowChunks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_BASE + ROW_GAP,
    overscan: 6,
  });

  const markPending = useCallback((ids: string[], on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const postActionFocus = useCallback(
    (actedId: string) => {
      const idx = filteredRows.findIndex((r) => r.shotId === actedId);
      const next = filteredRows[idx + 1] ?? filteredRows[idx - 1] ?? null;
      const nextId = next?.shotId ?? null;
      setHotCardId(nextId);
      if (nextId) {
        const gi = filteredRows.findIndex((r) => r.shotId === nextId);
        if (gi >= 0) {
          const rowIdx = Math.floor(gi / cols);
          rowVirtualizer.scrollToIndex(rowIdx, { align: "auto" });
        }
      }
    },
    [filteredRows, cols, rowVirtualizer],
  );

  const approveOne = useCallback(
    async (shotId: string) => {
      markPending([shotId], true);
      try {
        const res = await fetch("/api/batch/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shotId, action: "approve" }),
        });
        if (res.ok) {
          postActionFocus(shotId);
          setRemoved((prev) => new Set(prev).add(shotId));
          setSelected((prev) => {
            const n = new Set(prev);
            n.delete(shotId);
            return n;
          });
        }
      } finally {
        markPending([shotId], false);
      }
    },
    [markPending, postActionFocus],
  );

  const rejectOne = useCallback(
    async (shotId: string) => {
      markPending([shotId], true);
      try {
        const res = await fetch("/api/batch/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shotId, action: "reject_motion" }),
        });
        if (res.ok) {
          postActionFocus(shotId);
          setRemoved((prev) => new Set(prev).add(shotId));
          setSelected((prev) => {
            const n = new Set(prev);
            n.delete(shotId);
            return n;
          });
        }
      } finally {
        markPending([shotId], false);
      }
    },
    [markPending, postActionFocus],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const id = hotCardId;
      if (!id || pending.has(id)) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        void rejectOne(id);
      }
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        void approveOne(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approveOne, rejectOne, pending, hotCardId]);

  const toggleSelect = useCallback((shotId: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(shotId)) n.delete(shotId);
      else n.add(shotId);
      return n;
    });
  }, []);

  const onCardPointer = useCallback(
    (e: React.MouseEvent, shotId: string, indexInFiltered: number) => {
      if (e.shiftKey && anchorIndexRef.current !== null) {
        const a = Math.min(anchorIndexRef.current, indexInFiltered);
        const b = Math.max(anchorIndexRef.current, indexInFiltered);
        setSelected((prev) => {
          const n = new Set(prev);
          for (let i = a; i <= b; i++) {
            const id = filteredRows[i]?.shotId;
            if (id) n.add(id);
          }
          return n;
        });
      } else {
        anchorIndexRef.current = indexInFiltered;
        toggleSelect(shotId);
      }
    },
    [filteredRows, toggleSelect],
  );

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(filteredRows.map((r) => r.shotId)));
  }, [filteredRows]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const bulkApprove = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy("approve");
    markPending(ids, true);
    try {
      const res = await fetch("/api/batch/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotIds: ids, action: "approve" }),
      });
      if (res.ok) {
        setRemoved((prev) => {
          const n = new Set(prev);
          ids.forEach((id) => n.add(id));
          return n;
        });
        setSelected(new Set());
      }
    } finally {
      markPending(ids, false);
      setBulkBusy(null);
    }
  }, [selected, markPending]);

  const bulkReject = useCallback(async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkBusy("reject");
    markPending(ids, true);
    try {
      const res = await fetch("/api/batch/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotIds: ids, action: "reject_motion" }),
      });
      if (res.ok) {
        setRemoved((prev) => {
          const n = new Set(prev);
          ids.forEach((id) => n.add(id));
          return n;
        });
        setSelected(new Set());
      }
    } finally {
      markPending(ids, false);
      setBulkBusy(null);
    }
  }, [selected, markPending]);

  const onLassoPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-boundary-card]")) return;
    lassoRef.current = {
      active: true,
      x1: e.clientX,
      y1: e.clientY,
      x2: e.clientX,
      y2: e.clientY,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setLassoUi({
      left: e.clientX,
      top: e.clientY,
      width: 0,
      height: 0,
    });
  }, []);

  const onLassoPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const l = lassoRef.current;
    if (!l?.active) return;
    l.x2 = e.clientX;
    l.y2 = e.clientY;
    const left = Math.min(l.x1, l.x2);
    const top = Math.min(l.y1, l.y2);
    const width = Math.abs(l.x2 - l.x1);
    const height = Math.abs(l.y2 - l.y1);
    setLassoUi({ left, top, width, height });
  }, []);

  const onLassoPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const l = lassoRef.current;
      if (!l?.active) return;
      l.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      lassoRef.current = null;
      const box = {
        left: Math.min(l.x1, l.x2),
        top: Math.min(l.y1, l.y2),
        right: Math.max(l.x1, l.x2),
        bottom: Math.max(l.y1, l.y2),
      };
      if (box.right - box.left < 4 && box.bottom - box.top < 4) {
        setLassoUi(null);
        return;
      }
      const root = scrollRef.current;
      if (root) {
        const cards = root.querySelectorAll<HTMLElement>("[data-boundary-card]");
        setSelected((prev) => {
          const n = new Set(prev);
          cards.forEach((el) => {
            const id = el.dataset.shotId;
            if (!id || removed.has(id)) return;
            if (rectsIntersect(el.getBoundingClientRect(), box)) n.add(id);
          });
          return n;
        });
      }
      setLassoUi(null);
    },
    [removed],
  );

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        Cut triage grid
      </p>
      <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
        Before/after frames at each <code className="font-mono text-[10px]">needs_review</code> cut, confidence filter,
        cluster tabs, lasso/shift-select, and{" "}
        <kbd className="font-mono text-[var(--color-text-tertiary)]">J</kbd> /{" "}
        <kbd className="font-mono text-[var(--color-text-tertiary)]">K</kbd> on hover.
      </p>

      {/* Sticky control bar */}
      <div
        className="sticky top-0 z-40 space-y-3 border-b pb-3 pt-1 backdrop-blur-md"
        style={{
          backgroundColor: "color-mix(in oklch, var(--color-surface-primary) 88%, transparent)",
          borderColor: "color-mix(in oklch, var(--color-border-default) 70%, transparent)",
        }}
      >
        {error ? (
          <p className="font-mono text-xs text-[var(--color-status-error)]">{error}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Film
            </label>
            <select
              value={filmId}
              onChange={(e) => setFilmId(e.target.value)}
              className="h-8 min-w-[12rem] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">Select a film…</option>
              {films.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-[min(100%,20rem)] flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Max confidence % (show cuts ≤ slider)
              </label>
              <span className="font-mono text-xs tabular-nums text-[var(--color-text-secondary)]">
                {confidenceMaxPct}%
                {sliderActive ? " · live" : ""}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={confidenceMaxPct}
              onChange={(e) => setConfidenceMaxPct(Number(e.target.value))}
              onMouseDown={() => setSliderActive(true)}
              onMouseUp={() => setSliderActive(false)}
              onTouchStart={() => setSliderActive(true)}
              onTouchEnd={() => setSliderActive(false)}
              className="h-2 w-full cursor-pointer accent-[var(--color-accent-base)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-t border-[var(--color-border-subtle)] pt-2">
          {BOUNDARY_TRIAGE_CLUSTERS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setClusterTab(tab)}
              className="rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors"
              style={{
                borderColor:
                  clusterTab === tab
                    ? "var(--color-accent-base)"
                    : "var(--color-border-default)",
                backgroundColor:
                  clusterTab === tab
                    ? "color-mix(in oklch, var(--color-accent-base) 22%, transparent)"
                    : "transparent",
                color: "var(--color-text-primary)",
              }}
            >
              {boundaryClusterLabel(tab)}{" "}
              <span className="tabular-nums text-[var(--color-text-tertiary)]">
                ({clusterCounts[tab] ?? 0})
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="xs" type="button" onClick={selectAllVisible}>
            Select all visible
          </Button>
          <Button variant="ghost" size="xs" type="button" onClick={clearSelection}>
            Clear selection
          </Button>
          <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
            Shift+click range · drag empty space to lasso
          </span>
          {selected.size > 0 ? (
            <>
              <Button
                variant="default"
                size="sm"
                type="button"
                disabled={bulkBusy !== null}
                className="rounded-full px-3"
                style={{
                  backgroundColor: "var(--color-status-verified)",
                  color: "var(--color-surface-primary)",
                }}
                onClick={() => void bulkApprove()}
              >
                {bulkBusy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve batch ({selected.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={bulkBusy !== null}
                className="rounded-full border-[var(--color-signal-amber)] px-3 text-[var(--color-signal-amber)]"
                onClick={() => void bulkReject()}
              >
                {bulkBusy === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                Reject batch ({selected.size})
              </Button>
            </>
          ) : null}
          <span className="ml-auto font-mono text-xs text-[var(--color-text-tertiary)]">
            {loading ? "Loading…" : `${filteredRows.length} visible · ${totalRemote} needs_review in film`}
          </span>
        </div>
      </div>

      {/* Virtual grid */}
      {!filmId ? (
        loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-[var(--color-text-tertiary)]" />
          </div>
        ) : films.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No films have shots flagged <code className="font-mono text-[10px]">needs_review</code> — nothing to triage
            here.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">Select a film to load up to 500 queued cuts.</p>
        )
      ) : loading && rawRows.length === 0 ? (
        <div className="flex justify-center py-24">
          <Loader2 className="size-8 animate-spin text-[var(--color-text-tertiary)]" />
        </div>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          No cuts match filters. Try another cluster tab or raise the confidence slider.
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="relative min-h-[70vh] flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)]"
          style={{
            backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 70%, transparent)",
          }}
          onPointerDown={onLassoPointerDown}
          onPointerMove={onLassoPointerMove}
          onPointerUp={onLassoPointerUp}
          onPointerCancel={onLassoPointerUp}
        >
          {lassoUi && lassoUi.width + lassoUi.height > 0 ? (
            <div
              className="pointer-events-none fixed z-50 border border-[var(--color-accent-base)]"
              style={{
                left: lassoUi.left,
                top: lassoUi.top,
                width: lassoUi.width,
                height: lassoUi.height,
                backgroundColor:
                  "color-mix(in oklch, var(--color-accent-base) 14%, transparent)",
              }}
            />
          ) : null}
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const chunk = rowChunks[vRow.index];
              if (!chunk) return null;
              return (
                <div
                  key={vRow.key}
                  className="absolute left-0 top-0 w-full"
                  style={{
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div
                    className="grid gap-3 px-2 pb-3"
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {chunk.map((row, ci) => {
                      const globalIdx = vRow.index * cols + ci;
                      const isSel = selected.has(row.shotId);
                      const isHi = hotCardId === row.shotId;
                      const busy = pending.has(row.shotId);
                      const pct =
                        row.confidence !== null ? Math.round(row.confidence * 100) : null;
                      return (
                        <div
                          key={row.shotId}
                          role="button"
                          tabIndex={0}
                          data-boundary-card
                          data-shot-id={row.shotId}
                          className="rounded-[var(--radius-lg)] border p-2 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--color-accent-base)]"
                          style={{
                            borderColor: isSel
                              ? "var(--color-accent-base)"
                              : isHi
                                ? "color-mix(in oklch, var(--color-accent-base) 55%, transparent)"
                                : "var(--color-border-default)",
                            backgroundColor:
                              "color-mix(in oklch, var(--color-surface-primary) 85%, transparent)",
                            boxShadow: isHi ? "0 0 0 1px var(--color-accent-base)" : undefined,
                          }}
                          onMouseEnter={() => setHotCardId(row.shotId)}
                          onMouseLeave={(e) => {
                            const rel = e.relatedTarget as Node | null;
                            if (rel && e.currentTarget.contains(rel)) return;
                            setHotCardId((cur) => (cur === row.shotId ? null : cur));
                          }}
                          onClick={(e) => onCardPointer(e, row.shotId, globalIdx)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleSelect(row.shotId);
                            }
                          }}
                        >
                          <div className="mb-1 flex items-center justify-between gap-1">
                            <span className="font-mono text-[9px] uppercase text-[var(--color-text-tertiary)]">
                              {boundaryClusterLabel(row.cluster)}
                            </span>
                            <span
                              className="font-mono text-[10px] tabular-nums"
                              style={{
                                color:
                                  pct !== null && pct < 50
                                    ? "var(--color-signal-amber)"
                                    : "var(--color-text-secondary)",
                              }}
                            >
                              {pct !== null ? `${pct}%` : "n/a"}
                            </span>
                          </div>
                          <ThumbPair
                            prevUrl={row.prevThumbnailUrl}
                            nextUrl={row.thumbnailUrl}
                            labelBefore="Frame before cut"
                            labelAfter="Frame after cut"
                          />
                          <div className="mt-2 flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              disabled={busy}
                              className="h-7 flex-1 rounded-md border-[var(--color-signal-amber)] font-mono text-[10px] text-[var(--color-signal-amber)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                void rejectOne(row.shotId);
                              }}
                            >
                              J · Motion
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              disabled={busy}
                              className="h-7 flex-1 rounded-md font-mono text-[10px]"
                              style={{
                                backgroundColor: "var(--color-status-verified)",
                                color: "var(--color-surface-primary)",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                void approveOne(row.shotId);
                              }}
                            >
                              K · OK
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
