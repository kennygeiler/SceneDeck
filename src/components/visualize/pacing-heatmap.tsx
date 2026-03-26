"use client";

import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type VizShot = {
  id: string;
  filmId: string;
  filmTitle: string;
  director: string;
  sceneTitle: string | null;
  sceneNumber: number | null;
  shotIndex: number;
  framing: string;
  depth: string;
  blocking: string;
  shotSize: string;
  angleVertical: string;
  duration: number;
  objectCount: number;
  description: string | null;
};

type VizFilm = {
  id: string;
  title: string;
  director: string;
  shotCount: number;
  sceneCount: number;
};

type PacingHeatmapProps = {
  shots: VizShot[];
  films: VizFilm[];
};

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

const BG = "#0d0d12";
const TEXT = "#f5f5f7";
const SECONDARY = "#8e8e99";
const TERTIARY = "#55555e";
const CYAN = "#5cb8d6";

/* Custom cyan-to-amber interpolator */
const CYAN_COLOR = "#5cb8d6";
const AMBER_COLOR = "#d6a05c";

function interpolateCyanAmber(t: number): string {
  const c = d3.color(CYAN_COLOR)!.rgb();
  const a = d3.color(AMBER_COLOR)!.rgb();
  const r = Math.round(c.r + (a.r - c.r) * t);
  const g = Math.round(c.g + (a.g - c.g) * t);
  const b = Math.round(c.b + (a.b - c.b) * t);
  return `rgb(${r},${g},${b})`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PacingHeatmap({ shots, films }: PacingHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  /* Organise shots by film ------------------------------------------- */

  const { filmRows, maxShotIndex, durationExtent } = useMemo(() => {
    const grouped = new Map<string, VizShot[]>();
    let maxIdx = 0;

    shots.forEach((s) => {
      if (!grouped.has(s.filmId)) grouped.set(s.filmId, []);
      grouped.get(s.filmId)!.push(s);
      if (s.shotIndex > maxIdx) maxIdx = s.shotIndex;
    });

    const rows = films
      .filter((f) => grouped.has(f.id))
      .map((f) => ({
        film: f,
        shots: grouped.get(f.id)!.sort((a, b) => a.shotIndex - b.shotIndex),
      }));

    const allDurations = shots.map((s) => s.duration);
    const ext: [number, number] = [
      d3.min(allDurations) ?? 0,
      d3.max(allDurations) ?? 10,
    ];

    return { filmRows: rows, maxShotIndex: maxIdx, durationExtent: ext };
  }, [shots, films]);

  /* D3 render -------------------------------------------------------- */

  const render = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container || filmRows.length === 0) return;

    const { width: W } = container.getBoundingClientRect();

    const CELL = Math.max(
      4,
      Math.min(12, Math.floor((W - 140) / (maxShotIndex + 1))),
    );
    const LABEL_W = 120;
    const margin = { top: 24, right: 16, bottom: 32, left: LABEL_W };
    const cols = maxShotIndex + 1;
    const rows = filmRows.length;
    const chartW = cols * CELL;
    const chartH = rows * CELL;
    const totalW = Math.max(W, chartW + margin.left + margin.right);
    const totalH = chartH + margin.top + margin.bottom;

    /* Duration colour scale */
    const colorScale = d3
      .scaleSequential(interpolateCyanAmber)
      .domain(durationExtent);

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", totalW).attr("height", totalH);

    const g = sel
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const tooltip = tooltipRef.current;

    /* Rows */
    filmRows.forEach((row, ri) => {
      /* Film label */
      g.append("text")
        .attr("x", -8)
        .attr("y", ri * CELL + CELL / 2)
        .attr("text-anchor", "end")
        .attr("dy", "0.35em")
        .attr("fill", SECONDARY)
        .attr("font-family", "ui-monospace, monospace")
        .attr("font-size", Math.min(10, CELL))
        .text(() => {
          const name = row.film.title;
          const maxLen = 16;
          return name.length > maxLen
            ? name.slice(0, maxLen - 1) + "\u2026"
            : name;
        });

      /* Cells */
      g.selectAll<SVGRectElement, VizShot>(`rect.cell-${ri}`)
        .data(row.shots)
        .join("rect")
        .attr("class", `cell-${ri}`)
        .attr("x", (d) => d.shotIndex * CELL)
        .attr("y", ri * CELL)
        .attr("width", CELL - 1)
        .attr("height", CELL - 1)
        .attr("rx", 1)
        .attr("fill", (d) => colorScale(d.duration))
        .attr("fill-opacity", 0.85)
        .on("mouseenter", (event, d) => {
          d3.select(event.currentTarget)
            .attr("fill-opacity", 1)
            .attr("stroke", TEXT)
            .attr("stroke-width", 1);

          if (!tooltip || !container) return;
          tooltip.style.opacity = "1";
          tooltip.innerHTML = `
            <div style="font-weight:600;color:${TEXT}">${d.filmTitle}</div>
            <div style="color:${SECONDARY}">Shot ${d.shotIndex} · ${d.framing.replace(/_/g, " ")}</div>
            <div style="color:${SECONDARY}">Duration: ${d.duration.toFixed(1)}s · ${d.shotSize}</div>
            ${d.sceneNumber != null ? `<div style="color:${TERTIARY}">Scene ${d.sceneNumber}</div>` : ""}
          `;
        })
        .on("mousemove", (event) => {
          if (!tooltip || !container) return;
          const bounds = container.getBoundingClientRect();
          tooltip.style.left = `${event.clientX - bounds.left + 14}px`;
          tooltip.style.top = `${event.clientY - bounds.top - 8}px`;
        })
        .on("mouseleave", (event) => {
          d3.select(event.currentTarget)
            .attr("fill-opacity", 0.85)
            .attr("stroke", "none");
          if (tooltip) tooltip.style.opacity = "0";
        });
    });

    /* X axis ticks (every N shots) */
    const tickStep = Math.max(1, Math.ceil(cols / 15));
    const xTicks = d3.range(0, cols, tickStep);

    g.selectAll<SVGTextElement, number>("text.x-tick")
      .data(xTicks)
      .join("text")
      .attr("class", "x-tick")
      .attr("x", (d) => d * CELL + CELL / 2)
      .attr("y", chartH + 14)
      .attr("text-anchor", "middle")
      .attr("fill", SECONDARY)
      .attr("font-family", "ui-monospace, monospace")
      .attr("font-size", 8)
      .text((d) => `${d}`);

    /* Colour legend */
    const legendW = 100;
    const legendH = 6;
    const legendX = chartW - legendW;
    const legendY = chartH + 22;

    const defs = sel.append("defs");
    const gradId = "pacing-grad";
    const grad = defs
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0%")
      .attr("x2", "100%");

    const stops = 10;
    for (let i = 0; i <= stops; i++) {
      const t = i / stops;
      grad
        .append("stop")
        .attr("offset", `${t * 100}%`)
        .attr("stop-color", interpolateCyanAmber(t));
    }

    const lg = g.append("g").attr("transform", `translate(${legendX},${legendY})`);

    lg.append("rect")
      .attr("width", legendW)
      .attr("height", legendH)
      .attr("rx", 2)
      .attr("fill", `url(#${gradId})`);

    lg.append("text")
      .attr("x", 0)
      .attr("y", -3)
      .attr("fill", TERTIARY)
      .attr("font-family", "ui-monospace, monospace")
      .attr("font-size", 7)
      .text(`${durationExtent[0].toFixed(1)}s`);

    lg.append("text")
      .attr("x", legendW)
      .attr("y", -3)
      .attr("text-anchor", "end")
      .attr("fill", TERTIARY)
      .attr("font-family", "ui-monospace, monospace")
      .attr("font-size", 7)
      .text(`${durationExtent[1].toFixed(1)}s`);
  }, [filmRows, maxShotIndex, durationExtent]);

  /* Resize observer -------------------------------------------------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    render();

    const ro = new ResizeObserver(() => render());
    ro.observe(container);
    return () => ro.disconnect();
  }, [render]);

  /* ------------------------------------------------------------------ */
  /*  JSX                                                                */
  /* ------------------------------------------------------------------ */

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        background: BG,
        border: `1px solid ${TERTIARY}`,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "10px 14px 6px" }}>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: CYAN,
          }}
        >
          Pacing Rhythm
        </span>
      </div>

      {/* SVG (horizontally scrollable if needed) */}
      <div style={{ overflowX: "auto", padding: "0 0 4px" }}>
        <svg ref={svgRef} style={{ display: "block" }} />
      </div>

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          pointerEvents: "none",
          opacity: 0,
          transition: "opacity 120ms ease",
          background: "rgba(13,13,18,0.92)",
          border: `1px solid ${TERTIARY}`,
          borderRadius: 6,
          padding: "6px 10px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 10,
          lineHeight: 1.45,
          color: TEXT,
          zIndex: 10,
          backdropFilter: "blur(6px)",
        }}
      />
    </div>
  );
}
