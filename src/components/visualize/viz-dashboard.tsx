"use client";

import { useEffect, useMemo, useState } from "react";
import type { VisualizationData } from "@/lib/types";

import { AngleProfile } from "./angle-profile";
import { ChordDiagram } from "./chord-diagram";
import { CompositionScatter } from "./composition-scatter";
import { DirectorRadar } from "./director-radar";
import { DurationCategoryChart } from "./duration-category-chart";
import { DurationRidgeline } from "./duration-ridgeline";
import { HierarchySunburst } from "./hierarchy-sunburst";
import { LightingGrid } from "./lighting-grid";
import { PacingHeatmap } from "./pacing-heatmap";
import { RhythmStream } from "./rhythm-stream";
import { StagingHeatmap } from "./staging-heatmap";

type VizDashboardProps = {
  data: VisualizationData;
};

/** Preset: model confidence floor (hides known low scores when populated). */
const HIGH_CONFIDENCE_MIN_PCT = 50;

export function VizDashboard({ data }: VizDashboardProps) {
  const [selectedFraming, setSelectedFraming] = useState<string | null>(null);
  const [selectedDirector, setSelectedDirector] = useState<string | null>(null);
  const [selectedFilm, setSelectedFilm] = useState<string | null>(null);
  const [minConfidencePct, setMinConfidencePct] = useState(0);

  const minConfidence = minConfidencePct / 100;

  /** Shots with a numeric `shot_metadata.confidence` from the composition classifier (same as film table “Conf.”). */
  const storedConfidenceCount = useMemo(
    () =>
      data.shots.filter((s) => s.confidence != null && Number.isFinite(s.confidence)).length,
    [data.shots],
  );

  const trustFilteredShots = useMemo(() => {
    let shots = data.shots;
    if (minConfidence > 0) {
      shots = shots.filter((s) => {
        const c = s.confidence;
        // Missing / non-finite scores: TS ingest often omits this column; do not wipe the corpus.
        if (c == null || !Number.isFinite(c)) return true;
        return c >= minConfidence;
      });
    }
    return shots;
  }, [data.shots, minConfidence]);

  const excludedByTrust = data.shots.length - trustFilteredShots.length;

  const filteredShots = useMemo(() => {
    let shots = trustFilteredShots;
    if (selectedFraming) shots = shots.filter((s) => s.framing === selectedFraming);
    if (selectedDirector) shots = shots.filter((s) => s.director === selectedDirector);
    if (selectedFilm) shots = shots.filter((s) => s.filmId === selectedFilm);
    return shots;
  }, [trustFilteredShots, selectedFraming, selectedDirector, selectedFilm]);

  const trustFiltersActive = minConfidencePct > 0;
  const chipFiltersActive = Boolean(
    selectedFraming || selectedDirector || selectedFilm,
  );
  const hasFilters = trustFiltersActive || chipFiltersActive;

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (id !== "composition-scatter") return;
    const el = document.getElementById("composition-scatter");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const chordTooFew = filteredShots.length < 2;

  return (
    <div className="space-y-6 pb-16">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
          Data Visualization
        </p>
        <h1
          className="mt-2 text-3xl font-bold tracking-[var(--letter-spacing-tight)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Composition &amp; staging
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {data.shots.length} shots across {data.films.length} films by{" "}
          {data.directors.length} directors. Framing, depth, blocking, and light
          joints across the archive.
          {hasFilters ? (
            <>
              {" "}
              Showing {filteredShots.length} shots after filters
              {excludedByTrust > 0 ? ` (${excludedByTrust} excluded by confidence filter).` : "."}
            </>
          ) : null}
        </p>
      </div>

      <section
        id="trust-filters"
        className="rounded-xl border border-[#1e1e28] bg-[#0d0d12]/80 px-4 py-3"
        aria-label="Confidence filters"
      >
        <h2 className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Corpus filters
        </h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Min stored composition confidence
            <input
              type="range"
              min={0}
              max={100}
              value={minConfidencePct}
              onChange={(e) => setMinConfidencePct(Number(e.target.value))}
              className="w-full accent-[var(--color-text-accent)]"
            />
            <span className="normal-case text-[11px] text-[var(--color-text-secondary)]">
              {minConfidencePct === 0
                ? "Off — no threshold"
                : `Hide shots whose stored score is below ${minConfidencePct}%`}
            </span>
          </label>
          <button
            type="button"
            title="Among shots with a stored composition confidence, hides those below 50%."
            onClick={() => {
              setMinConfidencePct(HIGH_CONFIDENCE_MIN_PCT);
            }}
            className="rounded-lg border border-[#2a2a34] bg-[#14141c] px-3 py-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-text-accent)] hover:text-[var(--color-text-primary)]"
          >
            High-confidence preset
            <span className="ml-1 normal-case text-[9px] text-[#55555e]">
              (≥{HIGH_CONFIDENCE_MIN_PCT}% stored score)
            </span>
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#8e8e99]">
          Uses the same field as the film shot table <span className="font-mono">Conf.</span> column: the composition
          classifier&rsquo;s self-reported score in <span className="font-mono">shot_metadata.confidence</span>{" "}
          (0–1, shown as %). Shots with no stored score stay in the corpus; only known low scores are removed when the
          slider is above 0.{" "}
          <span className="tabular-nums">
            {storedConfidenceCount} / {data.shots.length} shots have a stored score.
          </span>
          {storedConfidenceCount === 0 && data.shots.length > 0 ? (
            <span className="block pt-1 text-[var(--color-signal-amber)]">
              No stored scores in this database yet — older rows may predate the field; run a fresh ingest to populate{" "}
              <span className="font-mono">shot_metadata.confidence</span>.
            </span>
          ) : null}
        </p>
        {excludedByTrust > 0 ? (
          <p className="mt-2 text-[11px] text-[#8e8e99]">
            Confidence filter excludes {excludedByTrust} shot
            {excludedByTrust === 1 ? "" : "s"} from aggregations below.
          </p>
        ) : null}
      </section>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Active:
          </span>
          {selectedFraming ? (
            <button
              type="button"
              onClick={() => setSelectedFraming(null)}
              className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-status-error)]"
              style={{
                backgroundColor: "rgba(92,184,214,0.12)",
                borderColor: "rgba(92,184,214,0.4)",
              }}
            >
              {selectedFraming.replace(/_/g, " ")} &times;
            </button>
          ) : null}
          {selectedDirector ? (
            <button
              type="button"
              onClick={() => setSelectedDirector(null)}
              className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-status-error)]"
              style={{
                backgroundColor: "rgba(155,124,214,0.12)",
                borderColor: "rgba(155,124,214,0.4)",
              }}
            >
              {selectedDirector} &times;
            </button>
          ) : null}
          {selectedFilm ? (
            <button
              type="button"
              onClick={() => setSelectedFilm(null)}
              className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-status-error)]"
              style={{
                backgroundColor: "rgba(214,160,92,0.12)",
                borderColor: "rgba(214,160,92,0.4)",
              }}
            >
              {data.films.find((f) => f.id === selectedFilm)?.title ?? selectedFilm}{" "}
              &times;
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSelectedFraming(null);
              setSelectedDirector(null);
              setSelectedFilm(null);
              setMinConfidencePct(0);
              setVerifiedOnly(false);
            }}
            className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-accent)]"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {chordTooFew ? (
        <p className="rounded-lg border border-[#2a2a34] bg-[#14141c] px-3 py-2 font-mono text-[11px] text-[#8e8e99]">
          Framing adjacency needs at least two shots in the current filter. Add films
          or relax the confidence filter to see transition chords.
        </p>
      ) : null}

      <section id="macro-staging-light" className="space-y-2">
        <h2 className="sr-only">Staging and lighting</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <StagingHeatmap shots={filteredShots} />
          <LightingGrid shots={filteredShots} />
        </div>
      </section>

      <section id="framing-adjacency" className="space-y-2">
        <h2 className="sr-only">Framing adjacency</h2>
        <div className="lg:col-span-2">
          <ChordDiagram
            shots={filteredShots}
            onSelectFraming={(slug) =>
              setSelectedFraming(slug === selectedFraming ? null : slug)
            }
          />
        </div>
      </section>

      <section id="scatter-radar" className="space-y-2">
        <h2 className="sr-only">Shot composition and director signatures</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div id="composition-scatter" className="scroll-mt-28">
            <CompositionScatter shots={filteredShots} />
          </div>
          <DirectorRadar shots={filteredShots} directors={data.directors} />
        </div>
      </section>

      <section id="angles-duration" className="space-y-2">
        <h2 className="sr-only">Angles and duration categories</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <AngleProfile shots={filteredShots} />
          <DurationCategoryChart shots={filteredShots} />
        </div>
        <div className="lg:col-span-2">
          <DurationRidgeline shots={filteredShots} />
        </div>
      </section>

      <section id="framing-over-time" className="space-y-2">
        <h2 className="sr-only">Framing over time</h2>
        <div className="lg:col-span-2">
          <RhythmStream shots={filteredShots} films={data.films} />
        </div>
      </section>

      <section id="hierarchy-pacing" className="space-y-2">
        <h2 className="sr-only">Hierarchy and pacing</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <HierarchySunburst shots={filteredShots} films={data.films} />
          <PacingHeatmap shots={filteredShots} films={data.films} />
        </div>
      </section>
    </div>
  );
}
