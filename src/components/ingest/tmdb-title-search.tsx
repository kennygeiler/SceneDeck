"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type TmdbHit = { tmdbId: number; title: string; year: string };

type TmdbTitleSearchProps = {
  title: string;
  onTitleChange: (value: string) => void;
  onPickFilm: (fields: { title: string; year: string; director: string }) => void;
  disabled?: boolean;
};

export function TmdbTitleSearch({
  title,
  onTitleChange,
  onPickFilm,
  disabled = false,
}: TmdbTitleSearchProps) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<TmdbHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickingId, setPickingId] = useState<number | null>(null);
  const [tmdbUnavailable, setTmdbUnavailable] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHits = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}`);
      if (res.status === 503) {
        setTmdbUnavailable(true);
        setHits([]);
        return;
      }
      setTmdbUnavailable(false);
      if (!res.ok) {
        setHits([]);
        return;
      }
      const data = (await res.json()) as { results?: TmdbHit[] };
      setHits(Array.isArray(data.results) ? data.results : []);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchHits(title);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, disabled, fetchHits]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function selectHit(hit: TmdbHit) {
    setPickingId(hit.tmdbId);
    try {
      const res = await fetch(
        `/api/tmdb/movie-for-ingest?id=${encodeURIComponent(String(hit.tmdbId))}`,
      );
      if (!res.ok) {
        onPickFilm({
          title: hit.title,
          year: hit.year,
          director: "",
        });
        setOpen(false);
        return;
      }
      const fields = (await res.json()) as {
        title: string;
        year: string;
        director: string;
      };
      onPickFilm(fields);
      setOpen(false);
    } catch {
      onPickFilm({
        title: hit.title,
        year: hit.year,
        director: "",
      });
      setOpen(false);
    } finally {
      setPickingId(null);
    }
  }

  const inputCls =
    "mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none focus:border-[var(--color-text-accent)]";

  return (
    <div ref={wrapRef} className="relative">
      <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        Film title
      </label>
      <input
        type="text"
        autoComplete="off"
        value={title}
        onChange={(e) => {
          onTitleChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => !disabled && setOpen(true)}
        disabled={disabled}
        placeholder="Search TMDB or type manually…"
        className={inputCls}
      />
      {tmdbUnavailable ? (
        <p className="mt-1 font-mono text-[10px] text-[var(--color-text-tertiary)]">
          Movie search needs <span className="text-[var(--color-text-secondary)]">TMDB_API_KEY</span> on the server.
          You can still type title, director, and year manually.
        </p>
      ) : null}
      {open && !disabled && title.trim().length >= 2 ? (
        <ul
          id="tmdb-ingest-suggestions"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-[var(--radius-md)] border py-1 shadow-lg"
          style={{
            backgroundColor: "var(--color-surface-primary)",
            borderColor: "color-mix(in oklch, var(--color-border-default) 80%, transparent)",
          }}
        >
          {loading ? (
            <li className="px-3 py-2 font-mono text-xs text-[var(--color-text-tertiary)]">Searching…</li>
          ) : hits.length === 0 ? (
            <li className="px-3 py-2 font-mono text-xs text-[var(--color-text-tertiary)]">No matches</li>
          ) : (
            hits.map((h) => (
              <li key={h.tmdbId}>
                <button
                  type="button"
                  disabled={pickingId !== null}
                  onClick={() => void selectHit(h)}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-surface-tertiary)] disabled:opacity-50"
                >
                  <span className="font-medium text-[var(--color-text-primary)]">{h.title}</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    {h.year || "Year TBD"} · TMDB #{h.tmdbId}
                    {pickingId === h.tmdbId ? " — loading…" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
