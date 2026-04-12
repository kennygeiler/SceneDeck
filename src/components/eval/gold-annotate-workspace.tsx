"use client";

import type { ChangeEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, CloudUpload, Copy, Download, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { evalBoundaryCuts, normalizeCutList } from "@/lib/boundary-eval";
import type { FilmEvalExportPayload } from "@/lib/film-eval-export";
import {
  evalTaxonomySlots,
  type GoldShotSegment,
} from "@/lib/slot-eval";
import type { FilmCard } from "@/lib/types";

const STORAGE_PREFIX = "metrovision:eval-gold:";

/** One "frame" step for arrow-key nudge (browser cannot seek true frames without fps). */
const FRAME_STEP_PRESETS: { label: string; sec: number }[] = [
  { label: "24 fps (film)", sec: 1 / 24 },
  { label: "25 fps", sec: 1 / 25 },
  { label: "30 fps", sec: 1 / 30 },
  { label: "1/20 s (~50ms)", sec: 0.05 },
  { label: "1/10 s (~100ms)", sec: 0.1 },
];

const COARSE_NUDGE_SEC = 1;

function snapFrameStepToPreset(sec: number): number {
  if (!Number.isFinite(sec) || sec <= 0) return FRAME_STEP_PRESETS[0]!.sec;
  const exact = FRAME_STEP_PRESETS.find((p) => Math.abs(p.sec - sec) < 1e-6);
  if (exact) return exact.sec;
  let best = FRAME_STEP_PRESETS[0]!.sec;
  let bestD = Infinity;
  for (const p of FRAME_STEP_PRESETS) {
    const d = Math.abs(p.sec - sec);
    if (d < bestD) {
      bestD = d;
      best = p.sec;
    }
  }
  return best;
}

function isKeyboardFormTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/** Clamp for `HTMLVideoElement.playbackRate` (browser support is typically ~0.25–4). */
function clampPlaybackPercent(pct: number): number {
  if (!Number.isFinite(pct)) return 100;
  return Math.min(400, Math.max(25, Math.round(pct)));
}

type SourceMode = "shot" | "custom" | "local";

type FilmPayload = {
  film: { id: string; title: string; director: string; year: number | null };
  shots: Array<{
    index: number;
    id: string;
    startTc: number | null;
    endTc: number | null;
    duration: number;
    framing: string;
  }>;
  predictedExport: FilmEvalExportPayload;
};

type Persisted = {
  cuts: number[];
  note: string;
  filmId: string | null;
  referenceShotId: string | null;
  sourceMode: SourceMode;
  customVideoUrl: string;
  timeOffsetSec: number;
  /** Remembered filename only; blob URL cannot persist across reloads. */
  localFileLabel?: string;
  frameStepSec?: number;
  /** Playback speed as % of normal (100 = 1×). */
  playbackSpeedPercent?: number;
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

/** Same shapes as `pnpm eval:pipeline` inputs: `{ cutsSec }` or raw `number[]`. */
function extractEvalCutsSec(data: unknown): number[] {
  if (Array.isArray(data)) {
    return data.map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  }
  if (data && typeof data === "object" && "cutsSec" in data) {
    const c = (data as { cutsSec: unknown }).cutsSec;
    if (Array.isArray(c)) {
      return c.map(Number).filter((x) => Number.isFinite(x) && x >= 0);
    }
  }
  throw new Error('Expected a number[] or an object with "cutsSec": number[]');
}

function extractShotsFromEvalJson(data: unknown): GoldShotSegment[] | null {
  if (!data || typeof data !== "object") return null;
  const s = (data as { shots?: unknown }).shots;
  if (!Array.isArray(s) || s.length === 0) return null;
  const out: GoldShotSegment[] = [];
  for (const row of s) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const startSec = Number(o.startSec);
    const endSec = Number(o.endSec);
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    out.push({
      startSec,
      endSec,
      framing: o.framing != null ? String(o.framing) : null,
      shotSize: o.shotSize != null ? String(o.shotSize) : null,
    });
  }
  return out.length ? out : null;
}

/** Avoid `res.json()` on empty bodies (proxies, 502 HTML) — prevents "Unexpected end of JSON input". */
async function readResponseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(
      `Expected JSON (${res.status}): ${trimmed.slice(0, 200)}${trimmed.length > 200 ? "…" : ""}`,
    );
  }
}

type GoldAnnotateWorkspaceProps = {
  films: FilmCard[];
};

function CutTimelineStrip({
  label,
  times,
  maxSec,
  markerClass,
}: {
  label: string;
  times: number[];
  maxSec: number;
  markerClass: string;
}) {
  const m = Math.max(maxSec, 1);
  return (
    <div className="space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        {label}{" "}
        <span className="tabular-nums text-[var(--color-text-secondary)]">({times.length})</span>
      </p>
      <div className="relative h-4 w-full overflow-hidden rounded border border-[var(--color-border-subtle)] bg-black/50">
        {times.length === 0 ? (
          <span className="absolute inset-0 flex items-center px-2 font-mono text-[10px] text-[var(--color-text-tertiary)]">
            —
          </span>
        ) : (
          times.map((t, i) => (
            <span
              key={`${t.toFixed(3)}-${i}`}
              className={`absolute top-0 bottom-0 w-px ${markerClass}`}
              style={{ left: `${Math.min(100, Math.max(0, (t / m) * 100))}%` }}
              title={`${t.toFixed(3)}s`}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function GoldAnnotateWorkspace({ films }: GoldAnnotateWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const persistHydrated = useRef(false);
  const prevSourceMode = useRef<SourceMode | null>(null);

  const [filmPayload, setFilmPayload] = useState<FilmPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cuts, setCuts] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [filmId, setFilmId] = useState<string>("");
  const [referenceShotId, setReferenceShotId] = useState<string>("");
  /** Resolved via `/api/eval/gold-annotate/shot-media` so film payload stays URL-free. */
  const [shotClipUrl, setShotClipUrl] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>(() =>
    films.length > 0 ? "shot" : "local",
  );
  const [customVideoUrl, setCustomVideoUrl] = useState("");
  const [timeOffsetSec, setTimeOffsetSec] = useState(0);
  /** Object URL from a picked file; cleared when leaving local mode or unloading. */
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [localFileLabel, setLocalFileLabel] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [frameStepSec, setFrameStepSec] = useState(1 / 24);
  const frameStepRef = useRef(frameStepSec);
  frameStepRef.current = frameStepSec;

  const [playbackSpeedPercent, setPlaybackSpeedPercent] = useState(100);
  /** Same units as `pnpm eval:pipeline --tol`. */
  const [compareTolSec, setCompareTolSec] = useState(0.5);
  /** Same as `pnpm eval:pipeline --iou` for --slots. */
  const [slotIouMin, setSlotIouMin] = useState(0.35);
  /** Human verified `shots` from last import, for slot metrics vs DB predicted. */
  const [importedGoldShots, setImportedGoldShots] = useState<GoldShotSegment[] | null>(null);
  const [evalReportFeedback, setEvalReportFeedback] = useState<string | null>(null);

  const [artifactAdminSecret, setArtifactAdminSecret] = useState("");
  const [rememberArtifactSecret, setRememberArtifactSecret] = useState(false);
  const [artifactSaveStatus, setArtifactSaveStatus] = useState<string | null>(null);
  const [artifactSaveError, setArtifactSaveError] = useState<string | null>(null);
  const [artifactSaving, setArtifactSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoSrcRef = useRef<string | null>(null);
  const localVideoUrlRef = useRef<string | null>(null);
  const evalJsonImportRef = useRef<HTMLInputElement | null>(null);
  const [playerTime, setPlayerTime] = useState(0);
  const filmTimelineRef = useRef(0);

  localVideoUrlRef.current = localVideoUrl;

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
        if (p.sourceMode === "shot" || p.sourceMode === "custom" || p.sourceMode === "local") {
          setSourceMode(p.sourceMode);
        }
        if (typeof p.customVideoUrl === "string") setCustomVideoUrl(p.customVideoUrl);
        if (typeof p.timeOffsetSec === "number" && Number.isFinite(p.timeOffsetSec)) {
          setTimeOffsetSec(p.timeOffsetSec);
        }
        if (typeof p.localFileLabel === "string") setLocalFileLabel(p.localFileLabel);
        if (typeof p.frameStepSec === "number" && Number.isFinite(p.frameStepSec) && p.frameStepSec > 0) {
          setFrameStepSec(snapFrameStepToPreset(p.frameStepSec));
        }
        if (typeof p.playbackSpeedPercent === "number" && Number.isFinite(p.playbackSpeedPercent)) {
          setPlaybackSpeedPercent(clampPlaybackPercent(p.playbackSpeedPercent));
        }
      } else if (urlFilm) {
        setFilmId(urlFilm);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    try {
      const s = sessionStorage.getItem("mv-eval-artifact-admin");
      if (s) {
        setArtifactAdminSecret(s);
        setRememberArtifactSecret(true);
      }
    } catch {
      /* ignore */
    }
  }, [sessionReady]);

  useEffect(() => {
    if (!rememberArtifactSecret) {
      try {
        sessionStorage.removeItem("mv-eval-artifact-admin");
      } catch {
        /* ignore */
      }
    }
  }, [rememberArtifactSecret]);

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
      localFileLabel,
      frameStepSec,
      playbackSpeedPercent,
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
    localFileLabel,
    frameStepSec,
    playbackSpeedPercent,
  ]);

  useEffect(() => {
    return () => {
      const u = localVideoUrlRef.current;
      if (u) URL.revokeObjectURL(u);
    };
  }, []);

  useEffect(() => {
    const prev = prevSourceMode.current;
    prevSourceMode.current = sourceMode;
    if (prev === "local" && sourceMode !== "local") {
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
      setLocalFileLabel("");
    }
  }, [sourceMode, localVideoUrl]);

  useEffect(() => {
    if (!filmId) {
      setFilmPayload(null);
      setLoadError(null);
      return;
    }
    setFilmPayload(null);
    let cancelled = false;
    (async () => {
      setLoadError(null);
      try {
        const res = await fetch(`/api/eval/gold-annotate/film?filmId=${encodeURIComponent(filmId)}`);
        const data = (await readResponseJson(res)) as FilmPayload | { error?: string };
        if (!res.ok) {
          throw new Error("error" in data ? String(data.error) : "Failed to load film");
        }
        if (cancelled) return;
        const fp = data as FilmPayload;
        if (!fp.predictedExport) {
          throw new Error("Film payload missing predictedExport; deploy API update?");
        }
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

  useEffect(() => {
    if (sourceMode !== "shot" || !referenceShotId.trim()) {
      setShotClipUrl(null);
      return;
    }
    let cancelled = false;
    setShotClipUrl(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/eval/gold-annotate/shot-media?shotId=${encodeURIComponent(referenceShotId.trim())}`,
        );
        const data = (await res.json()) as { videoUrl?: string | null; error?: string };
        if (!res.ok || cancelled) return;
        setShotClipUrl(typeof data.videoUrl === "string" ? data.videoUrl : null);
      } catch {
        if (!cancelled) setShotClipUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceMode, referenceShotId]);

  const referenceShot = useMemo(() => {
    if (!filmPayload || !referenceShotId) return null;
    return filmPayload.shots.find((s) => s.id === referenceShotId) ?? null;
  }, [filmPayload, referenceShotId]);

  const videoSrc =
    sourceMode === "local"
      ? localVideoUrl
      : sourceMode === "custom"
        ? customVideoUrl.trim() || null
        : shotClipUrl;

  videoSrcRef.current = videoSrc;

  const applyPlaybackRate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = clampPlaybackPercent(playbackSpeedPercent) / 100;
  }, [playbackSpeedPercent]);

  useEffect(() => {
    applyPlaybackRate();
  }, [applyPlaybackRate, videoSrc]);

  const nudgePlayer = useCallback((deltaSec: number) => {
    const v = videoRef.current;
    if (!v || !videoSrcRef.current) return;
    v.pause();
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined;
    let next = v.currentTime + deltaSec;
    if (dur != null) next = Math.max(0, Math.min(dur - 1e-6, next));
    else next = Math.max(0, next);
    v.currentTime = next;
    setPlayerTime(next);
  }, []);

  const filmTimelineSec = useMemo(() => {
    if (sourceMode === "custom" || sourceMode === "local") {
      return roundTc(timeOffsetSec + playerTime);
    }
    const base = referenceShot?.startTc ?? 0;
    return roundTc(base + playerTime);
  }, [sourceMode, timeOffsetSec, playerTime, referenceShot?.startTc]);

  filmTimelineRef.current = filmTimelineSec;

  const boundaryStats = useMemo(() => {
    if (!filmPayload?.predictedExport) return null;
    const pred = filmPayload.predictedExport.cutsSec;
    return evalBoundaryCuts(cuts, pred, compareTolSec);
  }, [filmPayload, cuts, compareTolSec]);

  const fnList = useMemo(() => {
    if (!boundaryStats) return [];
    const matchedGt = new Set(boundaryStats.matchedPairs.map((x) => x.gt));
    return normalizeCutList(cuts).filter((g) => !matchedGt.has(g));
  }, [boundaryStats, cuts]);

  const fpList = useMemo(() => {
    if (!boundaryStats || !filmPayload?.predictedExport) return [];
    const matchedPr = new Set(boundaryStats.matchedPairs.map((x) => x.pred));
    return normalizeCutList(filmPayload.predictedExport.cutsSec).filter((p) => !matchedPr.has(p));
  }, [boundaryStats, filmPayload]);

  const compareMaxSec = useMemo(() => {
    const p = filmPayload?.predictedExport?.cutsSec ?? [];
    const all = [...cuts, ...p, filmTimelineSec];
    if (all.length === 0) return 120;
    return Math.max(120, ...all) * 1.02;
  }, [cuts, filmPayload, filmTimelineSec]);

  const predShotSegments = useMemo((): GoldShotSegment[] => {
    if (!filmPayload?.predictedExport?.shots?.length) return [];
    return filmPayload.predictedExport.shots.map((s) => ({
      startSec: s.startSec,
      endSec: s.endSec,
      framing: s.framing ?? null,
      shotSize: s.shotSize ?? null,
    }));
  }, [filmPayload]);

  const slotSummary = useMemo(() => {
    if (!importedGoldShots?.length || !predShotSegments.length) return null;
    return evalTaxonomySlots(importedGoldShots, predShotSegments, slotIouMin);
  }, [importedGoldShots, predShotSegments, slotIouMin]);

  const evalPipelineReport = useMemo(() => {
    if (!boundaryStats) return null;
    const out: Record<string, unknown> = {
      boundary: {
        toleranceSec: boundaryStats.toleranceSec,
        truePositives: boundaryStats.truePositives,
        falsePositives: boundaryStats.falsePositives,
        falseNegatives: boundaryStats.falseNegatives,
        precision: boundaryStats.precision,
        recall: boundaryStats.recall,
        f1: boundaryStats.f1,
        matchedPairsSample: boundaryStats.matchedPairs.slice(0, 40),
      },
    };
    if (slotSummary) {
      out.taxonomySlots = slotSummary;
    }
    return out;
  }, [boundaryStats, slotSummary]);

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
      if (isKeyboardFormTarget(ev.target)) return;

      if (ev.key === "c" || ev.key === "C") {
        if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
        ev.preventDefault();
        addCutAtFilmTime();
        return;
      }

      if (ev.code === "Space" || ev.key === " ") {
        const v = videoRef.current;
        if (!v || !videoSrcRef.current) return;
        ev.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
        return;
      }

      const step = frameStepRef.current;

      if (ev.key === "ArrowLeft") {
        if (!videoSrcRef.current) return;
        ev.preventDefault();
        nudgePlayer(ev.shiftKey ? -COARSE_NUDGE_SEC : -step);
        return;
      }
      if (ev.key === "ArrowRight") {
        if (!videoSrcRef.current) return;
        ev.preventDefault();
        nudgePlayer(ev.shiftKey ? COARSE_NUDGE_SEC : step);
        return;
      }
      if (ev.key === "," || ev.key === "<") {
        if (!videoSrcRef.current) return;
        ev.preventDefault();
        nudgePlayer(-step);
        return;
      }
      if (ev.key === "." || ev.key === ">") {
        if (!videoSrcRef.current) return;
        ev.preventDefault();
        nudgePlayer(step);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addCutAtFilmTime, nudgePlayer]);

  function removeCut(index: number) {
    setCuts((prev) => prev.filter((_, idx) => idx !== index));
  }

  function clearCuts() {
    if (cuts.length === 0) return;
    if (!window.confirm("Clear all cuts for this session?")) return;
    setCuts([]);
    setImportedGoldShots(null);
  }

  function onFilmChange(nextId: string) {
    setImportedGoldShots(null);
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

  function onPickLocalFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    if (!file) {
      setLocalVideoUrl(null);
      setLocalFileLabel("");
      return;
    }
    if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|mkv)$/iu.test(file.name)) {
      window.alert("Pick a video file (e.g. mp4, webm, mov).");
      ev.target.value = "";
      return;
    }
    setLocalVideoUrl(URL.createObjectURL(file));
    setLocalFileLabel(file.name);
  }

  function clearLocalFile() {
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    setLocalVideoUrl(null);
    setLocalFileLabel("");
  }

  async function onPickEvalJsonImport(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      const raw = extractEvalCutsSec(data);
      const next = [...new Set(raw.map(roundTc))].sort((a, b) => a - b);
      if (cuts.length > 0) {
        if (
          !window.confirm(
            `Replace ${cuts.length} cuts in this session with ${next.length} from “${file.name}”?`,
          )
        ) {
          return;
        }
      }
      setCuts(next);
      setImportedGoldShots(extractShotsFromEvalJson(data));
      if (data && typeof data === "object" && "annotatorNote" in data && !note.trim()) {
        const an = (data as { annotatorNote?: unknown }).annotatorNote;
        if (typeof an === "string" && an.trim()) {
          setNote(an.trim());
        }
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not read eval JSON.");
    }
  }

  function buildGoldExportPayload(): Record<string, unknown> {
    const fromLocalName = localFileLabel.replace(/\.[^.]+$/u, "").trim();
    const filmTitle =
      filmPayload?.film.title ??
      films.find((f) => f.id === filmId)?.title ??
      (sourceMode === "local" && fromLocalName ? fromLocalName : null) ??
      "annotation";
    const createdAt = new Date().toISOString();
    return {
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
      timeOffsetSec:
        sourceMode === "custom" || sourceMode === "local" ? timeOffsetSec : undefined,
      localFileName: sourceMode === "local" && localFileLabel ? localFileLabel : undefined,
      playbackSpeedPercent:
        clampPlaybackPercent(playbackSpeedPercent) !== 100
          ? clampPlaybackPercent(playbackSpeedPercent)
          : undefined,
      cutsSec: cuts,
    };
  }

  function downloadJson() {
    const payload = buildGoldExportPayload();
    const filmTitle = String(payload.filmTitle ?? "annotation");
    const createdAt = String(payload.createdAt ?? new Date().toISOString());
    const slug = slugifyPart(filmTitle) || "cuts";
    const stamp = createdAt.slice(0, 10);
    const filename = `human-verified-cuts-${slug}-${stamp}.json`;

    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function saveEvalArtifactToServer(kind: "gold" | "predicted") {
    setArtifactSaveError(null);
    setArtifactSaveStatus(null);
    const bodyPayload =
      kind === "gold" ? buildGoldExportPayload() : filmPayload?.predictedExport;
    if (!bodyPayload) {
      setArtifactSaveError(
        kind === "predicted"
          ? "Load a film with predicted shots from the database first."
          : "Nothing to save.",
      );
      return;
    }
    setArtifactSaving(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (artifactAdminSecret.trim()) {
        headers.Authorization = `Bearer ${artifactAdminSecret.trim()}`;
      }
      const ft =
        kind === "gold"
          ? String((bodyPayload as { filmTitle?: string }).filmTitle ?? "session")
          : String((bodyPayload as { filmTitle?: string }).filmTitle ?? "film");
      const res = await fetch("/api/eval/artifacts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          kind,
          filmId: filmId || null,
          sessionId: sessionId || null,
          label: `${kind} · ${ft}`,
          payload: bodyPayload,
        }),
      });
      const data = (await readResponseJson(res)) as { error?: string; retrievalUrl?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      if (rememberArtifactSecret && artifactAdminSecret.trim()) {
        try {
          sessionStorage.setItem("mv-eval-artifact-admin", artifactAdminSecret.trim());
        } catch {
          /* ignore */
        }
      }
      const url = data.retrievalUrl ?? "";
      if (url) {
        setArtifactSaveStatus(url);
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setArtifactSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setArtifactSaving(false);
    }
  }

  function downloadPredictedJson() {
    if (!filmPayload?.predictedExport) return;
    const pe = filmPayload.predictedExport;
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = slugifyPart(pe.filmTitle) || "predicted";
    const blob = new Blob([`${JSON.stringify(pe, null, 2)}\n`], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `predicted-${slug}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyEvalPipelineReport() {
    if (!evalPipelineReport) return;
    try {
      await navigator.clipboard.writeText(`${JSON.stringify(evalPipelineReport, null, 2)}\n`);
      setEvalReportFeedback("Copied JSON — same fields as pnpm eval:pipeline (boundary + taxonomySlots if available).");
      setTimeout(() => setEvalReportFeedback(null), 2800);
    } catch {
      setEvalReportFeedback("Copy failed.");
      setTimeout(() => setEvalReportFeedback(null), 3000);
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <section className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          <Link href="/tuning" className="text-[var(--color-text-accent)] hover:underline">
            Boundary Tuning
          </Link>
          <span className="text-[var(--color-text-tertiary)]"> · human verified cuts</span>
        </p>
        <h1
          className="text-3xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Human verified cuts
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--color-text-secondary)]">
          Bookmark this URL to resume. Cuts are stored in <code className="font-mono text-xs">localStorage</code>{" "}
          for this session only. Export downloads JSON compatible with{" "}
          <code className="font-mono text-xs">pnpm eval:pipeline</code> (<code className="font-mono text-xs">cutsSec</code>{" "}
          = interior hard-cut times on the <strong>film timeline</strong> in seconds).
        </p>
        <p className="max-w-3xl text-sm leading-7 text-[var(--color-text-secondary)]">
          The film dropdown is filled from your <strong>database</strong> (ingested titles). If it is empty, use{" "}
          <strong>Local video file</strong> to annotate a file on disk, ingest a film from{" "}
          <a href="/ingest" className="text-[var(--color-text-accent)] underline-offset-1 hover:underline">
            Ingest
          </a>
          , or paste a playable URL under Custom. Reloading the page clears a local file pick until you choose it again.
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
              disabled={films.length === 0}
              className="h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 text-sm text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">
                {films.length === 0 ? "No films in database — use Local file or Ingest" : "Select a film…"}
              </option>
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
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <label
                className={`flex cursor-pointer items-center gap-2 ${films.length === 0 ? "cursor-not-allowed opacity-45" : ""}`}
                title={films.length === 0 ? "Ingest a film first, or use Local file" : undefined}
              >
                <input
                  type="radio"
                  name="src"
                  checked={sourceMode === "shot"}
                  disabled={films.length === 0}
                  onChange={() => setSourceMode("shot")}
                  className="accent-[var(--color-accent-base)]"
                />
                Shot clip (needs DB film)
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="src"
                  checked={sourceMode === "local"}
                  onChange={() => setSourceMode("local")}
                  className="accent-[var(--color-accent-base)]"
                />
                Local video file
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

          {sourceMode === "local" ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Video file (this device)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="video/*,.mp4,.webm,.mov,.mkv"
                    onChange={onPickLocalFile}
                    className="max-w-full text-xs text-[var(--color-text-secondary)] file:mr-2 file:rounded-md file:border file:border-[var(--color-border-default)] file:bg-[var(--color-surface-primary)] file:px-3 file:py-1 file:font-mono"
                  />
                  {localFileLabel ? (
                    <Button type="button" variant="ghost" size="xs" onClick={clearLocalFile}>
                      Clear file
                    </Button>
                  ) : null}
                </div>
                {localFileLabel ? (
                  <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                    Loaded: {localFileLabel}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  Time offset (film seconds when player is at 0:00)
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
                  if (v) {
                    setPlayerTime(v.currentTime);
                    v.playbackRate = clampPlaybackPercent(playbackSpeedPercent) / 100;
                  }
                }}
              />
            ) : (
              <div className="flex size-full items-center justify-center p-6 text-center font-mono text-xs text-[var(--color-text-tertiary)]">
                {sourceMode === "local"
                  ? "Choose a local video file, or switch to Custom URL."
                  : "Select a film and shot, paste a URL, or use a local file."}
              </div>
            )}
          </div>

          {videoSrc ? (
            <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-3">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Playback speed (% of normal)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="range"
                  min={25}
                  max={400}
                  step={5}
                  value={clampPlaybackPercent(playbackSpeedPercent)}
                  onChange={(e) =>
                    setPlaybackSpeedPercent(clampPlaybackPercent(Number(e.target.value)))
                  }
                  className="min-w-[8rem] flex-1 accent-[var(--color-accent-base)]"
                />
                <span className="min-w-[3.25rem] font-mono text-sm tabular-nums text-[var(--color-text-primary)]">
                  {clampPlaybackPercent(playbackSpeedPercent)}%
                </span>
                <div className="flex flex-wrap gap-1">
                  {([50, 75, 90, 100, 125] as const).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-7 rounded-md px-2 font-mono text-[10px]"
                      onClick={() => setPlaybackSpeedPercent(p)}
                    >
                      {p}%
                    </Button>
                  ))}
                </div>
              </div>
              <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
                25–400% · slower speeds help spot cuts; timeline is still wall-clock film seconds.
              </p>
            </div>
          ) : null}
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
            <div className="mt-3 flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Frame step (arrow ← →)
              </label>
              <select
                value={String(snapFrameStepToPreset(frameStepSec))}
                onChange={(e) => setFrameStepSec(Number(e.target.value))}
                className="h-8 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 font-mono text-xs text-[var(--color-text-primary)]"
              >
                {FRAME_STEP_PRESETS.map((p) => (
                  <option key={p.label} value={String(p.sec)}>
                    {p.label} ({p.sec.toFixed(4)}s)
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full font-mono text-xs"
                disabled={!videoSrc}
                onClick={() => nudgePlayer(-frameStepSec)}
              >
                −1f
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full font-mono text-xs"
                disabled={!videoSrc}
                onClick={() => nudgePlayer(frameStepSec)}
              >
                +1f
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full font-mono text-xs"
                disabled={!videoSrc}
                onClick={() => nudgePlayer(-COARSE_NUDGE_SEC)}
              >
                −1s
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full font-mono text-xs"
                disabled={!videoSrc}
                onClick={() => nudgePlayer(COARSE_NUDGE_SEC)}
              >
                +1s
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">
              Tip: pause near the cut (Space), nudge with arrows or <kbd className="rounded border px-1">,</kbd>{" "}
              <kbd className="rounded border px-1">.</kbd>, then <kbd className="rounded border px-1">C</kbd>.{" "}
              <kbd className="rounded border px-1">Shift</kbd>+←/→ moves ±1s.
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
            <input
              ref={evalJsonImportRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-hidden
              onChange={(e) => void onPickEvalJsonImport(e)}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => evalJsonImportRef.current?.click()}
            >
              <Upload className="size-4" />
              Import cuts JSON
            </Button>
          </div>
          <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            Import accepts human verified / predicted exports: <code className="rounded border px-0.5">cutsSec</code> array or a raw{" "}
            <code className="rounded border px-0.5">number[]</code>. Fills this bookmarked session (localStorage); optional{" "}
            <code className="rounded border px-0.5">annotatorNote</code> is applied only if the note field is empty.
          </p>
          <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
            Shortcuts: <kbd className="rounded border px-1">Space</kbd> play/pause ·{" "}
            <kbd className="rounded border px-1">←</kbd>
            <kbd className="rounded border px-1">→</kbd>
            <kbd className="rounded border px-1">,</kbd>
            <kbd className="rounded border px-1">.</kbd> nudge · <kbd className="rounded border px-1">C</kbd> cut
            (not while typing in a field).
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
              placeholder="e.g. v1 human verified cuts, only hard cuts, time base = feature start"
            />
          </div>

          <Button type="button" variant="default" className="w-full rounded-full" onClick={downloadJson}>
            <Download className="size-4" />
            Download human verified cuts JSON
          </Button>

          <div
            className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Private copy (Neon, not git)
            </p>
            <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
              Stores JSON in Postgres. Retrieval uses a secret link with <code className="font-mono text-[10px]">?t=</code>{" "}
              (save it — the token is not stored server-side). In production, add env{" "}
              <code className="font-mono text-[10px]">METROVISION_EVAL_ARTIFACT_ADMIN_SECRET</code> with a long random
              string, redeploy, then paste <strong>that same string</strong> in the field below (not the variable name, not
              the word <code className="font-mono text-[10px]">Bearer</code>).
            </p>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Same value as env METROVISION_EVAL_ARTIFACT_ADMIN_SECRET
              </label>
              <input
                type="password"
                autoComplete="off"
                value={artifactAdminSecret}
                onChange={(e) => setArtifactAdminSecret(e.target.value)}
                placeholder="Paste the random secret from Vercel / hosting env"
                className="h-9 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 font-mono text-xs text-[var(--color-text-primary)]"
              />
              <label className="flex cursor-pointer items-center gap-2 pt-1 font-mono text-[10px] text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={rememberArtifactSecret}
                  onChange={(e) => setRememberArtifactSecret(e.target.checked)}
                  className="accent-[var(--color-accent-base)]"
                />
                Remember in sessionStorage (this tab session)
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="rounded-full sm:flex-1"
                disabled={artifactSaving}
                onClick={() => void saveEvalArtifactToServer("gold")}
              >
                <CloudUpload className="size-4" />
                Save human verified cuts to DB
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full sm:flex-1"
                disabled={artifactSaving || !filmPayload?.predictedExport}
                onClick={() => void saveEvalArtifactToServer("predicted")}
              >
                <CloudUpload className="size-4" />
                Save predicted to DB
              </Button>
            </div>
            {artifactSaveError ? (
              <p className="font-mono text-xs text-[var(--color-signal-amber)]">{artifactSaveError}</p>
            ) : null}
            {artifactSaveStatus ? (
              <div className="space-y-1">
                <p className="font-mono text-[10px] text-[var(--color-signal-green)]">
                  Saved — retrieval URL copied if clipboard allowed. Keep this link private.
                </p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={artifactSaveStatus}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-2 py-1 font-mono text-[10px] text-[var(--color-text-primary)]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="shrink-0 font-mono text-xs"
                    onClick={() => {
                      void navigator.clipboard.writeText(artifactSaveStatus).catch(() => {});
                    }}
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="space-y-4 rounded-[var(--radius-xl)] border p-5"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Predicted eval (same logic as CLI)
        </p>
        {films.length === 0 ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            No films in the database yet. Use{" "}
            <a href="/ingest" className="text-[var(--color-text-accent)] underline-offset-1 hover:underline">
              Ingest
            </a>{" "}
            to add a title, then select it in the <strong>Film</strong> dropdown above.
          </p>
        ) : !filmId ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
            Select a <strong>Film</strong> in the dropdown above. This block compares your session’s human verified cuts{" "}
            <code className="font-mono text-xs">cutsSec</code> to predicted interior cuts from ingested shots (same
            matcher as <code className="font-mono text-xs">pnpm eval:pipeline</code>).
          </p>
        ) : loadError ? (
          <p className="mt-1 text-sm text-[var(--color-signal-amber)]">{loadError}</p>
        ) : !filmPayload?.predictedExport ? (
          <p className="mt-1 font-mono text-sm text-[var(--color-text-tertiary)]">Loading film data…</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
                  Boundary cuts vs ingested shots use the same matcher as{" "}
                  <code className="font-mono text-xs">pnpm eval:pipeline</code> (no files required). Predicted cuts match{" "}
                  <code className="font-mono text-xs">pnpm eval:export-film</code>. Use{" "}
                  <strong>Copy eval report</strong> for CLI-shaped JSON. Optional slot metrics match{" "}
                  <code className="font-mono text-xs">--slots</code> when you <strong>Import cuts JSON</strong> from a file
                  that also includes <code className="font-mono text-xs">shots[]</code>. If you use{" "}
                  <strong>Local file</strong> or <strong>Custom URL</strong>, align <strong>Time offset</strong> with the DB
                  timeline.
                </p>
              </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={downloadPredictedJson}
              >
                <Download className="size-4" />
                Download predicted JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={!evalPipelineReport}
                onClick={() => void copyEvalPipelineReport()}
              >
                <Copy className="size-4" />
                Copy eval report
              </Button>
            </div>
          </div>
          {evalReportFeedback ? (
            <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">{evalReportFeedback}</p>
          ) : null}

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Boundary tolerance <code className="font-mono">—tol</code> (sec)
              </label>
              <input
                type="number"
                step={0.05}
                min={0}
                value={compareTolSec}
                onChange={(e) => setCompareTolSec(Math.max(0, Number(e.target.value) || 0))}
                className="h-9 w-28 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 font-mono text-sm tabular-nums text-[var(--color-text-primary)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Slot min IoU <code className="font-mono">—iou</code>
              </label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={slotIouMin}
                onChange={(e) =>
                  setSlotIouMin(Math.min(1, Math.max(0, Number(e.target.value) || 0)))
                }
                className="h-9 w-28 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 font-mono text-sm tabular-nums text-[var(--color-text-primary)]"
              />
            </div>
            {boundaryStats ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs tabular-nums sm:grid-cols-3">
                <span className="text-[var(--color-text-tertiary)]">
                  TP <span className="text-[var(--color-text-primary)]">{boundaryStats.truePositives}</span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  FP <span className="text-[var(--color-signal-amber)]">{boundaryStats.falsePositives}</span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  FN <span className="text-[var(--color-signal-amber)]">{boundaryStats.falseNegatives}</span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  P{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {(boundaryStats.precision * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  R{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {(boundaryStats.recall * 100).toFixed(1)}%
                  </span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  F1{" "}
                  <span className="text-[var(--color-text-primary)]">{boundaryStats.f1.toFixed(3)}</span>
                </span>
              </div>
            ) : null}
          </div>

          {importedGoldShots?.length ? (
            <p className="font-mono text-[10px] text-[var(--color-text-secondary)]">
              Slot eval: <span className="tabular-nums">{importedGoldShots.length}</span> human verified{" "}
              <code className="font-mono text-[10px]">shots[]</code> from last import vs{" "}
              <span className="tabular-nums">{predShotSegments.length}</span> DB shots (IoU ≥{" "}
              {slotIouMin}
              ).
            </p>
          ) : (
            <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
              <code className="font-mono text-[10px]">--slots</code> framing/shotSize: import JSON that includes{" "}
              <code className="font-mono text-[10px]">shots[]</code> (<code className="font-mono text-[10px]">startSec</code>/
              <code className="font-mono text-[10px]">endSec</code>). Annotate-only exports are usually cuts-only.
            </p>
          )}

          {slotSummary ? (
            <div
              className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-primary) 70%, transparent)",
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Taxonomy slots
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs tabular-nums sm:grid-cols-3">
                <span className="text-[var(--color-text-tertiary)]">
                  Matched{" "}
                  <span className="text-[var(--color-text-primary)]">{slotSummary.matchedPairs}</span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  Framing acc{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {slotSummary.framingAccuracy != null
                      ? `${(slotSummary.framingAccuracy * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </span>
                <span className="text-[var(--color-text-tertiary)]">
                  Shot size acc{" "}
                  <span className="text-[var(--color-text-primary)]">
                    {slotSummary.shotSizeAccuracy != null
                      ? `${(slotSummary.shotSizeAccuracy * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </span>
                <span className="col-span-2 text-[var(--color-text-tertiary)] sm:col-span-3">
                  Framing denom {slotSummary.framingDenominator} · Shot size denom{" "}
                  {slotSummary.shotSizeDenominator}
                </span>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4">
            <CutTimelineStrip
              label="Human verified cuts (this session)"
              times={normalizeCutList(cuts)}
              maxSec={compareMaxSec}
              markerClass="bg-[var(--color-accent-base)]"
            />
            <CutTimelineStrip
              label="Predicted (DB shot starts)"
              times={normalizeCutList(filmPayload.predictedExport.cutsSec)}
              maxSec={compareMaxSec}
              markerClass="bg-sky-400/90"
            />
            <p className="font-mono text-[10px] text-[var(--color-text-tertiary)]">
              Playhead ≈ {filmTimelineSec.toFixed(3)}s on both tracks when the time base matches.
            </p>
          </div>

          {boundaryStats && boundaryStats.matchedPairs.length > 0 ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Matched pairs (δ = pred − human verified)
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                {boundaryStats.matchedPairs
                  .slice()
                  .sort((a, b) => a.gt - b.gt)
                  .map((m, i) => (
                    <li
                      key={`${m.gt}-${m.pred}-${i}`}
                      className="flex flex-wrap gap-x-3 text-[var(--color-text-secondary)]"
                    >
                      <span className="text-[var(--color-signal-green)]">TP</span>
                      <span className="tabular-nums">{m.gt.toFixed(3)}s</span>
                      <span className="text-[var(--color-text-tertiary)]">↔</span>
                      <span className="tabular-nums">{m.pred.toFixed(3)}s</span>
                      <span className="tabular-nums text-[var(--color-text-tertiary)]">
                        Δ {(m.pred - m.gt).toFixed(3)}s
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          {fnList.length > 0 ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-signal-amber)]">
                Missed vs DB (FN) · {fnList.length}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
                Human verified cuts with no predicted cut within {compareTolSec}s.
              </p>
              <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-xs tabular-nums text-[var(--color-text-primary)]">
                {fnList.map((t) => (
                  <li key={`fn-${t}`}>{t.toFixed(3)}s</li>
                ))}
              </ul>
            </div>
          ) : null}

          {fpList.length > 0 ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-signal-amber)]">
                Extra vs human verified (FP) · {fpList.length}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[var(--color-text-secondary)]">
                Predicted cuts with no human verified cut within {compareTolSec}s.
              </p>
              <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-xs tabular-nums text-[var(--color-text-primary)]">
                {fpList.map((t) => (
                  <li key={`fp-${t}`}>{t.toFixed(3)}s</li>
                ))}
              </ul>
            </div>
          ) : null}
          </>
        )}
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
