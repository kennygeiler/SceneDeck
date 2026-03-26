"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import * as d3 from "d3";
import type { VizShot } from "@/lib/types";

type Props = {
  shots: VizShot[];
  directors: string[];
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

// Distinct palette for directors (different hue range)
const DIRECTOR_PALETTE = [
  "#5cb8d6",
  "#d6445a",
  "#4dd68a",
  "#d6b84d",
  "#9966d6",
  "#d6994d",
  "#44d6bb",
  "#cc44d6",
  "#6dd64d",
  "#4d6ad6",
  "#d64488",
  "#aad64d",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DirectorRadar({ shots, directors }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 520 });

  // ---- Responsive sizing ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          const size = Math.min(w, 700);
          setDimensions({ width: size, height: size * 0.85 });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Compute axes (top 8 movement types across all shots) ----
  const axes = useMemo(() => {
    const counts = d3.rollup(
      shots,
      (v) => v.length,
      (d) => d.framing
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([type]) => type);
  }, [shots]);

  // ---- Per-director percentages ----
  const directorData = useMemo(() => {
    const filteredDirs =
      directors.length > 0
        ? directors
        : [...new Set(shots.map((s) => s.director))].slice(0, 6);

    return filteredDirs.map((dir) => {
      const dirShots = shots.filter((s) => s.director === dir);
      const total = dirShots.length || 1;
      const counts = d3.rollup(
        dirShots,
        (v) => v.length,
        (d) => d.framing
      );
      const values = axes.map((axis) => ((counts.get(axis) ?? 0) / total) * 100);
      return { director: dir, values };
    });
  }, [shots, directors, axes]);

  // ---- Render ----
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;

    if (axes.length === 0 || directorData.length === 0) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#8e8e99")
        .attr("font-size", 12)
        .text("Not enough data for radar");
      return;
    }

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(cx, cy) - 60;
    const levels = 5;

    const g = svg.attr("width", width).attr("height", height).append("g");

    const numAxes = axes.length;
    const angleSlice = (Math.PI * 2) / numAxes;

    // Max value for scale
    const maxVal = Math.max(
      10,
      d3.max(directorData, (d) => d3.max(d.values)!) ?? 10
    );

    const rScale = d3.scaleLinear().domain([0, maxVal]).range([0, radius]);

    // ---- Concentric grid circles ----
    for (let lvl = 1; lvl <= levels; lvl++) {
      const r = (radius / levels) * lvl;
      g.append("circle")
        .attr("cx", cx)
        .attr("cy", cy)
        .attr("r", r)
        .attr("fill", "none")
        .attr("stroke", "#1e1e28")
        .attr("stroke-width", 1);

      // Level value label
      g.append("text")
        .attr("x", cx + 4)
        .attr("y", cy - r + 3)
        .attr("fill", "#55555e")
        .attr("font-size", 8)
        .attr("font-family", "monospace")
        .text(`${((maxVal / levels) * lvl).toFixed(0)}%`);
    }

    // ---- Axis lines + labels ----
    for (let i = 0; i < numAxes; i++) {
      const angle = angleSlice * i - Math.PI / 2;
      const lineX = cx + Math.cos(angle) * radius;
      const lineY = cy + Math.sin(angle) * radius;

      g.append("line")
        .attr("x1", cx)
        .attr("y1", cy)
        .attr("x2", lineX)
        .attr("y2", lineY)
        .attr("stroke", "#1e1e28")
        .attr("stroke-width", 1);

      // Label
      const labelR = radius + 16;
      const lx = cx + Math.cos(angle) * labelR;
      const ly = cy + Math.sin(angle) * labelR;

      g.append("text")
        .attr("x", lx)
        .attr("y", ly)
        .attr("text-anchor", () => {
          if (Math.abs(Math.cos(angle)) < 0.1) return "middle";
          return Math.cos(angle) > 0 ? "start" : "end";
        })
        .attr("dominant-baseline", () => {
          if (Math.abs(Math.sin(angle)) < 0.1) return "middle";
          return Math.sin(angle) > 0 ? "hanging" : "auto";
        })
        .attr("fill", MOVEMENT_COLORS[axes[i]] ?? "#8e8e99")
        .attr("font-size", 9)
        .attr("font-family", "monospace")
        .text(axes[i].replace(/_/g, " "));
    }

    // ---- Director polygons ----
    const line = d3
      .lineRadial<number>()
      .angle((_d, i) => angleSlice * i)
      .radius((d) => rScale(d))
      .curve(d3.curveLinearClosed);

    directorData.forEach((dd, di) => {
      const color = DIRECTOR_PALETTE[di % DIRECTOR_PALETTE.length];

      // Polygon fill
      const pathData = line(dd.values);
      if (!pathData) return;

      g.append("path")
        .attr("d", pathData)
        .attr("transform", `translate(${cx},${cy})`)
        .attr("fill", color)
        .attr("fill-opacity", 0)
        .attr("stroke", color)
        .attr("stroke-width", 0)
        .attr("stroke-opacity", 0)
        .transition()
        .duration(800)
        .delay(di * 150)
        .attr("fill-opacity", 0.1)
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.8);

      // Vertex dots
      dd.values.forEach((val, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const r = rScale(val);
        g.append("circle")
          .attr("cx", cx + Math.cos(angle) * r)
          .attr("cy", cy + Math.sin(angle) * r)
          .attr("r", 0)
          .attr("fill", color)
          .attr("stroke", "#0d0d12")
          .attr("stroke-width", 1.5)
          .transition()
          .duration(600)
          .delay(di * 150 + i * 40)
          .attr("r", 3);
      });
    });

    // ---- Legend ----
    const legendG = g
      .append("g")
      .attr("transform", `translate(${width - 20}, 12)`);

    directorData.forEach((dd, i) => {
      const color = DIRECTOR_PALETTE[i % DIRECTOR_PALETTE.length];
      const row = legendG
        .append("g")
        .attr("transform", `translate(0, ${i * 18})`);

      row
        .append("rect")
        .attr("x", -120)
        .attr("y", -5)
        .attr("width", 10)
        .attr("height", 10)
        .attr("rx", 2)
        .attr("fill", color);

      row
        .append("text")
        .attr("x", -106)
        .attr("y", 0)
        .attr("dominant-baseline", "central")
        .attr("fill", "#8e8e99")
        .attr("font-size", 10)
        .attr("font-family", "monospace")
        .text(
          dd.director.length > 18
            ? dd.director.slice(0, 16) + "..."
            : dd.director
        );
    });
  }, [axes, directorData, dimensions]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-[#1e1e28] bg-[#0d0d12] overflow-hidden"
    >
      <div className="px-4 pt-3 pb-1">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#5cb8d6]">
          Director Signatures
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
