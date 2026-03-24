"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { VizShot } from "@/lib/types";

type Props = {
  shots: VizShot[];
  onSelectMovement?: (type: string | null) => void;
};

// ---------------------------------------------------------------------------
// Movement type colour palette
// ---------------------------------------------------------------------------

const MOVEMENT_COLORS: Record<string, string> = {
  static: "#4a4a5e",
  pan: "#5cb8d6",
  tilt: "#4dbaa8",
  dolly: "#4dd68a",
  truck: "#6dd64d",
  pedestal: "#99cc44",
  crane: "#d6b84d",
  boom: "#d6994d",
  zoom: "#aad64d",
  dolly_zoom: "#d66a4d",
  handheld: "#9966d6",
  steadicam: "#4d6ad6",
  drone: "#7744d6",
  aerial: "#4d99d6",
  arc: "#cc44d6",
  whip_pan: "#d6445a",
  whip_tilt: "#d64488",
  rack_focus: "#44d6bb",
  follow: "#44d699",
  reveal: "#44d666",
  reframe: "#6666aa",
};

function colorFor(type: string): string {
  return MOVEMENT_COLORS[type] ?? "#666";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChordDiagram({ shots, onSelectMovement }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 });

  // ---- Responsive sizing via ResizeObserver ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) {
          const size = Math.min(width, 700);
          setDimensions({ width: size, height: size });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Build transition matrix & render ----
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (shots.length < 2) {
      svg
        .append("text")
        .attr("x", dimensions.width / 2)
        .attr("y", dimensions.height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#8e8e99")
        .attr("font-size", 12)
        .text("Not enough shots for transitions");
      return;
    }

    // Group shots by film, sort by shotIndex, build pairs
    const byFilm = d3.group(shots, (d) => d.filmId);
    const pairs: [string, string][] = [];
    for (const filmShots of byFilm.values()) {
      const sorted = [...filmShots].sort((a, b) => a.shotIndex - b.shotIndex);
      for (let i = 0; i < sorted.length - 1; i++) {
        pairs.push([sorted[i].movementType, sorted[i + 1].movementType]);
      }
    }

    // Determine unique movement types present
    const typeSet = new Set<string>();
    for (const [a, b] of pairs) {
      typeSet.add(a);
      typeSet.add(b);
    }
    const types = [...typeSet].sort();
    const n = types.length;
    if (n === 0) return;

    const indexMap = new Map(types.map((t, i) => [t, i]));

    // Build matrix
    const matrix: number[][] = Array.from({ length: n }, () =>
      Array(n).fill(0)
    );
    for (const [a, b] of pairs) {
      matrix[indexMap.get(a)!][indexMap.get(b)!] += 1;
    }

    // Layout
    const { width, height } = dimensions;
    const outerRadius = Math.min(width, height) / 2 - 60;
    const innerRadius = outerRadius - 20;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    // Chord layout
    const chord = d3
      .chord()
      .padAngle(0.04)
      .sortSubgroups(d3.descending)(matrix);

    const arc = d3.arc<d3.ChordGroup>().innerRadius(innerRadius).outerRadius(outerRadius);

    const ribbon = d3.ribbon<d3.Chord, d3.ChordSubgroup>().radius(innerRadius);

    // ---- Ribbons ----
    const ribbons = g
      .append("g")
      .attr("fill-opacity", 0.55)
      .selectAll("path")
      .data(chord)
      .join("path")
      .attr("d", ribbon as any)
      .attr("fill", (d) => colorFor(types[d.source.index]))
      .attr("stroke", "none")
      .style("mix-blend-mode", "screen");

    // Hover interactions for ribbons
    ribbons
      .on("mouseenter", function () {
        ribbons.attr("fill-opacity", 0.12);
        d3.select(this).attr("fill-opacity", 0.85).raise();
      })
      .on("mouseleave", function () {
        ribbons.attr("fill-opacity", 0.55);
      });

    // ---- Groups (outer arcs) ----
    const groups = g
      .append("g")
      .selectAll("g")
      .data(chord.groups)
      .join("g");

    groups
      .append("path")
      .attr("d", arc as any)
      .attr("fill", (d) => colorFor(types[d.index]))
      .attr("stroke", "#0d0d12")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (_e, d) => {
        onSelectMovement?.(types[d.index]);
      })
      .on("mouseenter", function (_e, d) {
        ribbons.attr("fill-opacity", (r) =>
          r.source.index === d.index || r.target.index === d.index ? 0.85 : 0.08
        );
        d3.select(this).attr("stroke", "#f5f5f7").attr("stroke-width", 2);
      })
      .on("mouseleave", function () {
        ribbons.attr("fill-opacity", 0.55);
        d3.select(this).attr("stroke", "#0d0d12").attr("stroke-width", 1.5);
      });

    // ---- Labels ----
    groups
      .append("text")
      .each((d: any) => {
        d.angle = (d.startAngle + d.endAngle) / 2;
      })
      .attr("dy", "0.35em")
      .attr("transform", (d: any) => {
        const angle = (d.angle * 180) / Math.PI - 90;
        const flip = d.angle > Math.PI;
        return `rotate(${angle}) translate(${outerRadius + 10}) ${flip ? "rotate(180)" : ""}`;
      })
      .attr("text-anchor", (d: any) => (d.angle > Math.PI ? "end" : "start"))
      .attr("fill", "#8e8e99")
      .attr("font-size", 9)
      .attr("font-family", "monospace")
      .text((d) => types[d.index].replace(/_/g, " "));

    // Entry animation
    ribbons
      .attr("opacity", 0)
      .transition()
      .duration(800)
      .delay((_d, i) => i * 15)
      .attr("opacity", 1);
  }, [shots, dimensions, onSelectMovement]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[#1e1e28] bg-[#0d0d12] overflow-hidden"
    >
      <div className="px-4 pt-3 pb-1">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#5cb8d6]">
          Movement Transitions
        </h3>
      </div>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block mx-auto"
      />
    </div>
  );
}
