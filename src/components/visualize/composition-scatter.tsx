"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import type { VizShot } from "@/lib/types";

type Props = {
  shots: VizShot[];
  onSelectShot?: (id: string) => void;
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
// Shot size ordinal scale (top → bottom: extreme_wide → extreme_close)
// ---------------------------------------------------------------------------

const SHOT_SIZES = [
  "extreme_wide",
  "wide",
  "full",
  "medium_full",
  "medium",
  "medium_close",
  "close",
  "extreme_close",
];

function shotSizeLabel(s: string): string {
  return s.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompositionScatter({ shots, onSelectShot }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const height = 460;

  // ---- Responsive width ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- Render ----
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    if (shots.length === 0) {
      svg
        .append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .attr("fill", "#8e8e99")
        .attr("font-size", 12)
        .text("No shots to display");
      return;
    }

    const margin = { top: 20, right: 24, bottom: 40, left: 100 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // ---- Scales ----
    const durationExtent = d3.extent(shots, (d) => d.duration) as [number, number];
    const xMin = Math.max(0.01, durationExtent[0]);
    const xMax = Math.max(xMin * 2, durationExtent[1]);

    const x = d3.scaleLog().domain([xMin, xMax]).range([0, innerW]).nice();

    // Determine which shot sizes are present and keep ordinal order
    const presentSizes = SHOT_SIZES.filter((s) =>
      shots.some((sh) => sh.shotSize === s)
    );
    const allSizes = presentSizes.length > 0 ? presentSizes : SHOT_SIZES;

    const y = d3.scalePoint().domain(allSizes).range([0, innerH]).padding(0.5);

    // ---- Gridlines ----
    g.append("g")
      .attr("class", "grid-x")
      .selectAll("line")
      .data(x.ticks(6))
      .join("line")
      .attr("x1", (d) => x(d))
      .attr("x2", (d) => x(d))
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "#1e1e28")
      .attr("stroke-dasharray", "2,3");

    g.append("g")
      .attr("class", "grid-y")
      .selectAll("line")
      .data(allSizes)
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", (d) => y(d)!)
      .attr("y2", (d) => y(d)!)
      .attr("stroke", "#1e1e28")
      .attr("stroke-dasharray", "2,3");

    // ---- Axes ----
    const xAxis = d3
      .axisBottom(x)
      .ticks(6, ".1~f")
      .tickSize(0);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(xAxis)
      .call((sel) => sel.select(".domain").attr("stroke", "#2a2a34"))
      .call((sel) =>
        sel.selectAll("text").attr("fill", "#8e8e99").attr("font-size", 9)
      );

    // x-axis label
    g.append("text")
      .attr("x", innerW / 2)
      .attr("y", innerH + 32)
      .attr("text-anchor", "middle")
      .attr("fill", "#55555e")
      .attr("font-size", 9)
      .attr("font-family", "monospace")
      .text("Duration (s, log)");

    const yAxis = d3.axisLeft(y).tickSize(0);

    g.append("g")
      .call(yAxis)
      .call((sel) => sel.select(".domain").attr("stroke", "#2a2a34"))
      .call((sel) =>
        sel
          .selectAll("text")
          .attr("fill", "#8e8e99")
          .attr("font-size", 9)
          .text((_d, i, nodes) => {
            const label = d3.select(nodes[i]).text();
            return shotSizeLabel(label);
          })
      );

    // ---- Tooltip reference ----
    const tooltip = d3.select(tooltipRef.current);

    // ---- Dots ----
    const dots = g
      .append("g")
      .selectAll("circle")
      .data(shots)
      .join("circle")
      .attr("cx", (d) => x(Math.max(xMin, d.duration)))
      .attr("cy", (d) => y(d.shotSize) ?? innerH / 2)
      .attr("r", 0)
      .attr("fill", (d) => colorFor(d.movementType))
      .attr("fill-opacity", 0.7)
      .attr("stroke", "#0d0d12")
      .attr("stroke-width", 1)
      .style("cursor", "pointer");

    // Entry animation
    dots
      .transition()
      .duration(600)
      .delay((_d, i) => i * 2)
      .attr("r", (d) => 3 + Math.min(d.objectCount, 20));

    // Interactions
    dots
      .on("mouseenter", function (event, d) {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("fill-opacity", 1)
          .attr("stroke", "#f5f5f7")
          .attr("stroke-width", 2);

        tooltip
          .style("opacity", 1)
          .style("left", `${event.offsetX + 14}px`)
          .style("top", `${event.offsetY - 10}px`).html(`
            <div style="font-weight:600;color:#f5f5f7;margin-bottom:2px">${d.filmTitle}</div>
            <div style="color:#8e8e99;font-size:10px;margin-bottom:4px">${d.director}</div>
            <div><span style="color:#55555e">movement</span> <span style="color:${colorFor(d.movementType)}">${d.movementType.replace(/_/g, " ")}</span></div>
            <div><span style="color:#55555e">size</span> ${shotSizeLabel(d.shotSize)}</div>
            <div><span style="color:#55555e">duration</span> ${d.duration.toFixed(2)}s</div>
            <div><span style="color:#55555e">objects</span> ${d.objectCount}</div>
          `);
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", `${event.offsetX + 14}px`)
          .style("top", `${event.offsetY - 10}px`);
      })
      .on("mouseleave", function () {
        d3.select(this)
          .transition()
          .duration(150)
          .attr("fill-opacity", 0.7)
          .attr("stroke", "#0d0d12")
          .attr("stroke-width", 1);

        tooltip.style("opacity", 0);
      })
      .on("click", (_e, d) => {
        onSelectShot?.(d.id);
      });
  }, [shots, width, onSelectShot]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl border border-[#1e1e28] bg-[#0d0d12] overflow-hidden"
    >
      <div className="px-4 pt-3 pb-1">
        <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#5cb8d6]">
          Shot Composition
        </h3>
      </div>
      <svg ref={svgRef} width={width} height={height} className="block" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute rounded-lg border border-[#1e1e28] bg-[#14141c] px-3 py-2 text-[11px] leading-relaxed opacity-0 transition-opacity duration-150 shadow-xl"
        style={{ fontFamily: "monospace", zIndex: 20 }}
      />
    </div>
  );
}
