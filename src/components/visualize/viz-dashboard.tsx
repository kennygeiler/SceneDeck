"use client";

import { useState, useMemo, useEffect } from "react";
import type { VisualizationData } from "@/lib/types";

import { ChordDiagram } from "./chord-diagram";
import { CompositionScatter } from "./composition-scatter";
import { DirectorRadar } from "./director-radar";
import { RhythmStream } from "./rhythm-stream";
import { HierarchySunburst } from "./hierarchy-sunburst";
import { PacingHeatmap } from "./pacing-heatmap";

type VizDashboardProps = {
  data: VisualizationData;
};

export function VizDashboard({ data }: VizDashboardProps) {
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [selectedDirector, setSelectedDirector] = useState<string | null>(null);
  const [selectedFilm, setSelectedFilm] = useState<string | null>(null);

  // Cross-filter shots based on global selections
  const filteredShots = useMemo(() => {
    let shots = data.shots;
    if (selectedMovement) shots = shots.filter((s) => s.framing === selectedMovement);
    if (selectedDirector) shots = shots.filter((s) => s.director === selectedDirector);
    if (selectedFilm) shots = shots.filter((s) => s.filmId === selectedFilm);
    return shots;
  }, [data.shots, selectedMovement, selectedDirector, selectedFilm]);

  const hasFilters = selectedMovement || selectedDirector || selectedFilm;

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (id !== "composition-scatter") return;
    const el = document.getElementById("composition-scatter");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
          Data Visualization
        </p>
        <h1
          className="mt-2 text-3xl font-bold tracking-[var(--letter-spacing-tight)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Visual Intelligence
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          {data.shots.length} shots across {data.films.length} films by {data.directors.length} directors.
          {hasFilters ? ` Showing ${filteredShots.length} filtered shots.` : ""}
        </p>
      </div>

      {/* Active filters bar */}
      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Filters:
          </span>
          {selectedMovement ? (
            <button
              type="button"
              onClick={() => setSelectedMovement(null)}
              className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-status-error)]"
              style={{
                backgroundColor: "rgba(92,184,214,0.12)",
                borderColor: "rgba(92,184,214,0.4)",
              }}
            >
              {selectedMovement.replace("_", " ")} &times;
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
              {data.films.find((f) => f.id === selectedFilm)?.title ?? selectedFilm} &times;
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { setSelectedMovement(null); setSelectedDirector(null); setSelectedFilm(null); }}
            className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-accent)]"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {/* Dashboard grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Row 1: Chord diagram (full width) */}
        <div className="lg:col-span-2">
          <ChordDiagram
            shots={data.shots}
            onSelectMovement={(mt) => setSelectedMovement(mt === selectedMovement ? null : mt)}
          />
        </div>

        {/* Row 2: Scatter + Radar */}
        <div id="composition-scatter" className="scroll-mt-28">
          <CompositionScatter shots={filteredShots} />
        </div>
        <DirectorRadar shots={data.shots} directors={data.directors} />

        {/* Row 3: Streamgraph (full width) */}
        <div className="lg:col-span-2">
          <RhythmStream shots={filteredShots} films={data.films} />
        </div>

        {/* Row 4: Sunburst + Heatmap */}
        <HierarchySunburst shots={data.shots} films={data.films} />
        <PacingHeatmap shots={data.shots} films={data.films} />
      </div>
    </div>
  );
}
