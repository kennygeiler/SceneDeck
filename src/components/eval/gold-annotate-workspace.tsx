"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Copy, Download, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FilmCard } from "@/lib/types";

const STORAGE_PREFIX = "metrovision:eval-gold:";

type SourceMode = "shot" | "custom";

type FilmPayload = {
  film: { id: string; title: string; director: string; year: number | null };
  shots: Array<{
    index: number;
    id: string;
    startTc: number | null;
    endTc: number | null;
    duration: number;
    videoUrl: string | null;
    framing: string;
  }>;
};

type Persisted = {
  cuts: number[];
  note: string;
  filmId: string | null;
  referenceShotId: string | null;
  sourceMode: SourceMode;
  customVideoUrl: string;
  timeOffsetSec: number;
};

function roundTc(sec: number): number {
  return Math.round(sec * 1000) / 1000;
}

function slugifyPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
}

type GoldAnnotateWorkspaceProps = {
  films: FilmCard[];
};

export function GoldAnnotateWorkspace({ films }: GoldAnnotateWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const persistHydrated = useRef(false);

  const [filmPayload, setFilmPayload] = useState<FilmPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cuts, setCuts] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [filmId, setFilmId] = useState<string>("");
  const [referenceShotId, setReferenceShotId] = useState<string>("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("shot");
  const [customVideoUrl, setCustomVideoUrl] = useState("");
  const [timeOffsetSec, setTimeOffsetSec] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const filmTimelineRef = useRef(0);

  const storageKey = sessionId ? `${STORAGE_PREFIX}${sessionId}` : null;

  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const existing = params.get("session");
    if (existing) {
      setSessionId(existing);
      setSessionReady(true);
      return;
    }

    const ns = crypto.randomUUID();
    const next = new URLSearchParams(window.location.search);
    next.set("session", ns);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    setSessionId(ns);
    setSessionReady(true);
  }, [pathname, router]);

  useEffect(() => {
    if (!storageKey || !sessionReady || persistHydrated.current) return;
    persistHydrated.current = true;
    const urlFilm = new URLSearchParams(window.location.search).get("film");
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        if (Array.isArray(p.cuts)) {
          setCuts(p.cuts.filter((x) => Number.isFinite(x)).map((x) => roundTc(Number(x))));
        }
        if (typeof p.note === "string") setNote(p.note);
        const fid = urlFilm || (typeof p.filmId === "string" ? p.filmId : "");
        if (fid) setFilmId(fid);
        if (typeof p.referenceShotId === "string") setReferenceShotId(p.referenceShotId);
        if (p.sourceMode === "shot" || p.sourceMode === "custom") setSourceMode(p.sourceMode);
        if (typeof p.customVideoUrl === "string") setCustomVideoUrl(p.customVideoUrl);
        if (typeof p.timeOffsetSec === "number" && Number.isFinite(p.timeOffsetSec)) {
          setTimeOffsetSec(p.timeOffsetSec);
        }
      } else if (urlFilm) {
        setFilmId(urlFilm);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, sessionReady]);

  useEffect(() => {
    if (!storageKey || !sessionReady) return;
    const payload: Persisted = {
      cuts,
      note,
      filmId: filmId || null,
      referenceShotId: referenceShotId || null,
      sourceMode,
      customVideoUrl,
      timeOffsetSec,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [
    storageKey,
    sessionReady,
    cuts,
    note,
    filmId,
    referenceShotId,
    sourceMode,
    customVideoUrl,
    timeOffsetSec,
  ]);

  useEffect(() => {
    if (!filmId) {
      setFilmPayload(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch(`/api/eval/gold-annotate/film?filmId=${encodeURIComponent(filmId)}`);
        const data = (await res.json()) as FilmPayload | { error?: string };
        if (!res.ok) {
          throw new Error("error" in data ? String(data.error) : "Failed to load film");
        }
        if (cancelled) return;
        const fp = data as FilmPayload;
        setFilmPayload(fp);
        setReferenceShotId((prev) => {
          if (prev && fp.shots.some((s) => s.id === prev)) return prev;
          return fp.shots[0]?.id ?? "";
        });
      } catch (e) {
        if (!cancelled) {
          setFilmPayload(null);
          setLoadError(e instanceof Error ? e.message : "Load failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filmId]);

  const referenceShot = useMemo(() => {
    if (!filmPayload || !referenceShotId) return null;
    return filmPayload.shots.find((s) => s.id === referenceShotId) ?? null;
  }, [filmPayload, referenceShotId]);

  const videoSrc =
    sourceMode === "custom"
      ? customVideoUrl.trim() || null
      : referenceShot?.videoUrl ?? null;

  const filmTimelineSec = useMemo(() => {
    if (sourceMode === "custom") {
      return roundTc(timeOffsetSec + playerTime);
    }
    const base = referenceShot?.startTc ?? 0;
    return roundTc(base + playerTime);
  }, [sourceMode, timeOffsetSec, playerTime, referenceShot?.startTc]);

  filmTimelineRef.current = filmTimelineSec;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setPlayerTime(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [videoSrc]);

  const addCutAtFilmTime = useCallback(() => {
    const t = roundTc(filmTimelineRef.current);
    setCuts((prev) => {
      if (prev.some((x) => Math.abs(x - t) < 0.04)) return prev;
      return [...prev, t].sort((a, b) => a - b);
    });
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLInputElement) {
        return;
      }
      if (ev.key === "c" || ev.key === "C") {
        ev.preventDefault();
        addCutAtFilmTime();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addCutAtFilmTime]);

  function removeCut(index: number) {
    setCuts((prev) => prev.filter((_, idx) => idx !== index));
  }

  function clearCuts() {
    if (cuts.length === 0) return;
    if (!window.confirm("Clear all cuts for this session?")) return;
    setCuts([]);
  }

  function onFilmChange(nextId: string) {
    setFilmId(nextId);
    setReferenceShotId("");
    const next = new URLSearchParams(searchParams.toString());
    if (sessionId) next.set("session", sessionId);
    if (nextId) next.set("film", nextId);
    else next.delete("film");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  async function copyBookmarkUrl() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback("Copied.");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback("Copy failed — copy from the address bar.");
      setTimeout(() => setCopyFeedback(null), 4000);
    }
  }

  function downloadJson() {
    const filmTitle = filmPayload?.film.title ?? films.find((f) => f.id === filmId)?.title ?? "film";
    const createdAt = new Date().toISOString();
    const payload = {
      schemaVersion: "1.0",
      source: "metrovision_gold_annotate",
      sessionId,
      filmId: filmId || null,
      filmTitle,
      director: filmPayload?.film.director ?? null,
      year: filmPayload?.film.year ?? null,
      annotatorNote: note.trim() || undefined,
      createdAt,
      referenceMode: sourceMode,
      referenceShotId: sourceMode === "shot" ? referenceShotId || undefined : undefined,
      timeOffsetSec: sourceMode === "custom" ? timeOffsetSec : undefined,
      cutsSec: cuts,
    };

    const slug = slugifyPart(filmTitle) || "gold";
    const stamp = createdAt.slice(0, 10);
    const filename = `gold-${slug}-${stamp}.json`;

    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-8 pb-24">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Internal · not linked from the homepage
        </p>
        <h1
          className="text-3xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Gold eval annotation
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--color-text-secondary)]">
          Bookmark this URL to resume. Cuts are stored in <code className="font-mono text-xs">localStorage</code>{" "}
          for this session only. Export downloads JSON compatible with{" "}
          <code className="font-mono text-xs">pnpm eval:pipeline</code> (<code className="font-mono text-xs">cutsSec</code>{" "}
          = interior hard-cut times on the <strong>film timeline</strong> in seconds).
        </p>
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-5"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Session
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="break-all rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
            {sessionId ?? "…"}
          </code>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void copyBookmarkUrl()}>
            <Bookmark className="size-4" />
            Copy bookmark URL
          </Button>
          {copyFeedback ? (
            <span className="font-mono text-xs text-[var(--color-text-tertiary)]">{copyFeedback}</span>
          ) : null}
        </div>
      </section>

      <section
        className="grid gap-6 rounded-[var(--radius-xl)] border p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Film
            </label>
            <select
              value={filmId}
              onChange={(e) => onFilmChange(e.target.value)}
              className="h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">Select a film…</option>
              {films.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} · {f.director}
                </option>
              ))}
            </select>
          </div>

          {loadError ? (
            <p className="text-sm text-[var(--color-signal-amber)]">{loadError}</p>
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Video source
            </span>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="src"
                  checked={sourceMode === "shot"}
                  onChange={() => setSourceMode("shot")}
                  className="accent-[var(--color-accent-base)]"
                />
                Shot clip (film time = shot start + player time)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="src"
                  checked={sourceMode === "custom"}
                  onChange={() => setSourceMode("custom")}
                  className="accent-[var(--color-accent-base)]"
                />
                Custom URL + offset
              </label>
            </div>
          </div>

          {sourceMode === "shot" && filmPayload ? (
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Reference shot (clip)
              </label>
              <select
                value={referenceShotId}
                onChange={(e) => setReferenceShotId(e.target.value)}
                className="h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm text-[var(--color-text-primary)]"
              >
                {filmPayload.shots.length === 0 ? (
                  <option value="">No shots in this film</option>
                ) : (
                  filmPayload.shots.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.index} · {s.startTc != null ? `${s.startTc.toFixed(2)}s` : "?"} →{" "}
                      {s.endTc != null ? `${s.endTc.toFixed(2)}s` : "?"} · {s.framing}
                    </option>
                  ))
                )}
              </select>
            </div>
          ) : null}

          {sourceMode === "custom" ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Video URL
                </label>
                <input
                  type="url"
                  value={customVideoUrl}
                  onChange={(e) => setCustomVideoUrl(e.target.value)}
                  placeholder="https://… or /api/s3?key=…"
                  className="h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 font-mono text-xs text-[var(--color-text-primary)]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Time offset (film seconds at player 0)
                </label>
                <input
                  type="number"
                  step={0.001}
                  value={timeOffsetSec}
                  onChange={(e) => setTimeOffsetSec(Number(e.target.value) || 0)}
                  className="h-9 w-40 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm"
                />
              </div>
            </div>
          ) : null}

          <div className="relative aspect-video overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-black">
            {videoSrc ? (
              <video
                ref={videoRef}
                key={videoSrc}
                src={videoSrc}
                controls
                playsInline
                className="size-full"
                onLoadedMetadata={() => {
                  const v = videoRef.current;
                  if (v) setPlayerTime(v.currentTime);
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center p-6 text-center font-mono text-xs text-[var(--color-text-tertiary)]">
                Select a film and shot, or set a custom video URL.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div
            className="rounded-[var(--radius-lg)] border p-4"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Film timeline (annotation clock)
            </p>
            <p className="mt-2 font-mono text-3xl tabular-nums text-[var(--color-text-primary)]">
              {filmTimelineSec.toFixed(3)}s
            </p>
            <p className="mt-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
              Player local: {playerTime.toFixed(3)}s
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="rounded-full" onClick={addCutAtFilmTime}>
              Add cut at film time
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={clearCuts}>
              <Trash2 className="size-4" />
              Clear cuts
            </Button>
          </div>
          <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            Shortcut: <kbd className="rounded border px-1">C</kbd> adds a cut (when not typing in a field).
          </p>

          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Annotator note (optional, embedded in JSON)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              placeholder="e.g. gold v1, only hard cuts, time base = feature start"
            />
          </div>

          <Button type="button" variant="default" className="w-full rounded-full" onClick={downloadJson}>
            <Download className="size-4" />
            Download gold JSON
          </Button>
        </div>
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-5"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Cuts ({cuts.length})
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="font-mono text-xs"
            onClick={() => {
              void copyBookmarkUrl();
            }}
          >
            <Copy className="size-3" />
            Copy URL
          </Button>
        </div>
        {cuts.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-text-secondary)]">No cuts yet.</p>
        ) : (
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto font-mono text-sm">
            {cuts.map((t, i) => (
              <li
                key={`${t}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border-subtle)] px-3 py-2"
              >
                <span className="tabular-nums text-[var(--color-text-primary)]">{t.toFixed(3)}s</span>
                <button
                  type="button"
                  onClick={() => removeCut(i)}
                  className="text-xs text-[var(--color-signal-amber)] hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
