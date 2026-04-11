"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type FilmOption = { id: string; title: string; director: string; year: number | null };

type PresetRow = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  config: unknown;
  isArchived: boolean;
};

type GoldRevision = {
  id: string;
  filmId: string;
  windowStartSec: number | null;
  windowEndSec: number | null;
  payload: unknown;
  replacesRevisionId: string | null;
  createdAt: string | null;
};

type EvalRunRow = {
  id: string;
  filmId: string;
  goldRevisionId: string;
  presetId: string | null;
  metrics: { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number };
  toleranceSec: number;
  unmatchedGoldSec: unknown;
  unmatchedPredSec: unknown;
  createdAt: string | null;
};

export function TuningWorkspace({ films }: { films: FilmOption[] }) {
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const [filmId, setFilmId] = useState(films[0]?.id ?? "");
  const [revisions, setRevisions] = useState<GoldRevision[]>([]);
  const [runs, setRuns] = useState<EvalRunRow[]>([]);
  const [goldRevisionId, setGoldRevisionId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [workerBase, setWorkerBase] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [predCuts, setPredCuts] = useState<number[]>([]);
  const [boundaryLabel, setBoundaryLabel] = useState("");
  const [tolerance, setTolerance] = useState(0.5);
  const [lastEval, setLastEval] = useState<unknown>(null);
  const [applyPresetId, setApplyPresetId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPresets = useCallback(async () => {
    const res = await fetch("/api/boundary-presets");
    const data = (await res.json()) as { presets?: PresetRow[] };
    const list = data.presets ?? [];
    setPresets(list);
    setPresetId((prev) => prev || list[0]?.id || "");
    setApplyPresetId((prev) => prev || list[0]?.id || "");
  }, []);

  const loadRevisions = useCallback(async () => {
    if (!filmId) return;
    const res = await fetch(`/api/eval-gold-revisions?filmId=${encodeURIComponent(filmId)}`);
    const data = (await res.json()) as { revisions?: GoldRevision[] };
    const list = data.revisions ?? [];
    setRevisions(list);
    setGoldRevisionId((prev) =>
      prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? "",
    );
  }, [filmId]);

  const loadRuns = useCallback(async () => {
    if (!filmId) return;
    const res = await fetch(`/api/boundary-eval-runs?filmId=${encodeURIComponent(filmId)}`);
    const data = (await res.json()) as { runs?: EvalRunRow[] };
    setRuns(data.runs ?? []);
  }, [filmId]);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const w =
      typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_WORKER_URL?.replace(/\/$/, "") ?? ""
        : "";
    setWorkerBase(w);
  }, []);

  const envSnippet = useMemo(() => {
    const p = presets.find((x) => x.id === applyPresetId);
    if (!p?.config || typeof p.config !== "object") {
      return "# Select a preset to generate env lines.";
    }
    const c = p.config as Record<string, unknown>;
    const det = String(c.boundaryDetector ?? "");
    const gap = c.mergeGapSec;
    return `export METROVISION_BOUNDARY_DETECTOR=${det}
export METROVISION_BOUNDARY_MERGE_GAP_SEC=${gap}`;
  }, [presets, applyPresetId]);

  async function duplicatePreset(fromId: string) {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/boundary-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateFromId: fromId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      await loadPresets();
      setStatus("Preset duplicated.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setBusy(false);
    }
  }

  async function runBoundaryDetect() {
    const base = workerBase.trim();
    if (!base) {
      setStatus("Set NEXT_PUBLIC_WORKER_URL so the app can call the worker.");
      return;
    }
    if (!videoPath.trim()) {
      setStatus("Enter videoPath (local path on the worker host).");
      return;
    }
    if (!presetId) {
      setStatus("Select a boundary preset.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`${base}/api/boundary-detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoPath: videoPath.trim(),
          presetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setPredCuts(Array.isArray(data.cutsSec) ? data.cutsSec : []);
      setBoundaryLabel(String(data.boundaryLabel ?? ""));
      setStatus(`Detect OK — ${data.shotCount ?? "?"} shots, ${(data.cutsSec as number[])?.length ?? 0} interior cuts.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Detect failed");
    } finally {
      setBusy(false);
    }
  }

  async function runEval() {
    if (!goldRevisionId || !predCuts.length) {
      setStatus("Need a gold revision and predicted cuts (run boundary detect first).");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/boundary-eval-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goldRevisionId,
          presetId: presetId || null,
          predictedCutsSec: predCuts,
          toleranceSec: tolerance,
          boundaryLabel: boundaryLabel || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setLastEval(data);
      await loadRuns();
      setStatus("Eval run saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Eval failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyPresetToFilm() {
    if (!filmId || !applyPresetId) {
      setStatus("Select film and preset to apply.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/films/${filmId}/boundary-cut-preset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundaryCutPresetId: applyPresetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setStatus("Film boundary preset updated. Worker ingest will use it when body preset is omitted.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-12">
      <section className="max-w-3xl rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Scope
        </h2>
        <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">
          This workspace is for <strong>shot-boundary</strong> detection only.{" "}
          Gemini classification and composition slots are unchanged and shared
          globally — tune those elsewhere.
        </p>
      </section>

      {status ? (
        <p className="font-mono text-sm text-[var(--color-text-accent)]">{status}</p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Global boundary presets
        </h2>
        <ul className="space-y-3">
          {presets.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-[var(--color-border-subtle)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPreset((x) => (x === p.id ? null : p.id))
                  }
                  className="text-left font-medium text-[var(--color-text-primary)]"
                >
                  {p.name}
                  {p.slug ? (
                    <span className="ml-2 font-mono text-xs text-[var(--color-text-tertiary)]">
                      {p.slug}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void duplicatePreset(p.id)}
                  className="text-xs text-[var(--color-text-accent)] underline"
                >
                  Duplicate
                </button>
              </div>
              {expandedPreset === p.id ? (
                <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-[var(--color-surface-primary)] p-3 font-mono text-[11px] text-[var(--color-text-secondary)]">
                  {JSON.stringify(p.config, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Gold revisions
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Create new human gold in{" "}
          <Link
            href="/eval/gold-annotate"
            className="text-[var(--color-text-accent)] underline"
          >
            /eval/gold-annotate
          </Link>{" "}
          (or POST <span className="font-mono text-xs">/api/eval-gold-revisions</span>
          ). History is append-only per edit chain.
        </p>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Film
          <select
            value={filmId}
            onChange={(e) => {
              setFilmId(e.target.value);
              setGoldRevisionId("");
            }}
            className="mt-1 block w-full max-w-md rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-[var(--color-text-primary)]"
          >
            {films.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title} ({f.director}
                {f.year != null ? `, ${f.year}` : ""})
              </option>
            ))}
          </select>
        </label>
        <ul className="space-y-2 font-mono text-xs text-[var(--color-text-secondary)]">
          {revisions.map((r) => (
            <li key={r.id}>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="goldRev"
                  checked={goldRevisionId === r.id}
                  onChange={() => setGoldRevisionId(r.id)}
                />
                {r.id.slice(0, 8)}… — window{" "}
                {r.windowStartSec ?? "∅"}–{r.windowEndSec ?? "∅"} —{" "}
                {r.createdAt ?? ""}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Predict + eval
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Worker URL:{" "}
          <span className="font-mono">
            {workerBase || "(set NEXT_PUBLIC_WORKER_URL)"}
          </span>
        </p>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Preset for detect
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="mt-1 block w-full max-w-md rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          videoPath (on worker host)
          <input
            value={videoPath}
            onChange={(e) => setVideoPath(e.target.value)}
            className="mt-1 block w-full max-w-xl rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 font-mono text-xs"
            placeholder="/data/films/foo.mp4"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runBoundaryDetect()}
          className="rounded-full border border-[var(--color-border-default)] px-4 py-2 text-sm"
        >
          Run boundary detect (worker)
        </button>
        {predCuts.length > 0 ? (
          <p className="font-mono text-xs text-[var(--color-text-tertiary)]">
            {predCuts.length} cuts — label {boundaryLabel || "—"}
          </p>
        ) : null}
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Tolerance (sec)
          <input
            type="number"
            step={0.05}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            className="mt-1 block w-32 rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runEval()}
          className="rounded-full border border-[var(--color-border-accent)] px-4 py-2 text-sm text-[var(--color-text-accent)]"
        >
          Score vs gold + save run
        </button>
        {lastEval && typeof lastEval === "object" && lastEval !== null && "eval" in lastEval ? (
          <pre className="max-h-56 overflow-auto rounded-lg bg-[var(--color-surface-primary)] p-4 font-mono text-[11px]">
            {JSON.stringify(
              (lastEval as { eval?: unknown; run?: unknown }).eval,
              null,
              2,
            )}
          </pre>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Saved eval runs
        </h2>
        <ul className="space-y-2 font-mono text-xs">
          {runs.map((r) => (
            <li key={r.id} className="text-[var(--color-text-secondary)]">
              F1 {(r.metrics?.f1 ?? 0).toFixed(3)} P {(r.metrics?.precision ?? 0).toFixed(3)} R{" "}
              {(r.metrics?.recall ?? 0).toFixed(3)} @ tol {r.toleranceSec} —{" "}
              {r.createdAt ?? ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Apply preset to film (ingest)
        </h2>
        <label className="block text-sm text-[var(--color-text-secondary)]">
          Preset
          <select
            value={applyPresetId}
            onChange={(e) => setApplyPresetId(e.target.value)}
            className="mt-1 block w-full max-w-md rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void applyPresetToFilm()}
          className="rounded-full border border-[var(--color-border-default)] px-4 py-2 text-sm"
        >
          Save to selected film
        </button>
        <pre className="max-h-40 overflow-auto rounded-lg bg-[var(--color-surface-primary)] p-4 font-mono text-[11px] text-[var(--color-text-secondary)]">
          {envSnippet}
        </pre>
      </section>
    </div>
  );
}
