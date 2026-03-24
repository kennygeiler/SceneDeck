"use client";

import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  movementType: string;
  direction: string;
  speed: string;
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

type HierarchySunburstProps = {
  shots: VizShot[];
  films: VizFilm[];
};

/* ------------------------------------------------------------------ */
/*  Movement type colours                                              */
/* ------------------------------------------------------------------ */

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

const colorFor = (m: string) => MOVEMENT_COLORS[m] ?? "#55555e";

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

const BG = "#0d0d12";
const TEXT = "#f5f5f7";
const SECONDARY = "#8e8e99";
const TERTIARY = "#55555e";
const CYAN = "#5cb8d6";

/* ------------------------------------------------------------------ */
/*  Hierarchy node datum                                               */
/* ------------------------------------------------------------------ */

type HNode = {
  name: string;
  kind: "root" | "film" | "scene" | "shot";
  movementType?: string;
  shot?: VizShot;
  children?: HNode[];
  value?: number;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function HierarchySunburst({ shots, films }: HierarchySunburstProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [breadcrumb, setBreadcrumb] = useState<string[]>(["All"]);
  const [tooltipData, setTooltipData] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  /* Build hierarchy -------------------------------------------------- */

  const rootData = useMemo<HNode>(() => {
    const filmMap = new Map<string, HNode>();

    films.forEach((f) => {
      filmMap.set(f.id, {
        name: f.title,
        kind: "film",
        children: [],
      });
    });

    /* Group shots by film → scene */
    shots.forEach((s) => {
      let filmNode = filmMap.get(s.filmId);
      if (!filmNode) {
        filmNode = { name: s.filmTitle, kind: "film", children: [] };
        filmMap.set(s.filmId, filmNode);
      }

      const sceneName =
        s.sceneNumber != null
          ? s.sceneTitle ?? `Scene ${s.sceneNumber}`
          : "Other";

      let sceneNode = filmNode.children!.find((c) => c.name === sceneName);
      if (!sceneNode) {
        sceneNode = { name: sceneName, kind: "scene", children: [] };
        filmNode.children!.push(sceneNode);
      }

      sceneNode.children!.push({
        name: `Shot ${s.shotIndex}`,
        kind: "shot",
        movementType: s.movementType,
        shot: s,
        value: Math.max(s.duration, 0.1),
      });
    });

    return {
      name: "All",
      kind: "root",
      children: Array.from(filmMap.values()),
    };
  }, [shots, films]);

  /* D3 render -------------------------------------------------------- */

  const render = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const { width: W } = container.getBoundingClientRect();
    const SIZE = Math.min(W, 520);
    const radius = SIZE / 2;

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", SIZE).attr("height", SIZE);

    const root = d3
      .hierarchy<HNode>(rootData)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const partition = d3.partition<HNode>().size([2 * Math.PI, radius]);
    partition(root);

    /* arc generator */
    const arc = d3
      .arc<d3.HierarchyRectangularNode<HNode>>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius / 2)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1 - 1);

    const g = sel
      .append("g")
      .attr("transform", `translate(${SIZE / 2},${SIZE / 2})`);

    /* Current zoom focus */
    let currentRoot: d3.HierarchyRectangularNode<HNode> =
      root as d3.HierarchyRectangularNode<HNode>;

    /* Determine fill colour */
    const fillColor = (
      d: d3.HierarchyRectangularNode<HNode>,
    ): string => {
      const kind = d.data.kind;
      if (kind === "root") return BG;
      if (kind === "film") return "#2a2a34";
      if (kind === "scene") return "#1e1e28";
      if (kind === "shot") return colorFor(d.data.movementType ?? "static");
      return TERTIARY;
    };

    /* Draw arcs */
    const paths = g
      .selectAll<SVGPathElement, d3.HierarchyRectangularNode<HNode>>(
        "path.arc",
      )
      .data(
        root.descendants().filter((d) => d.depth > 0) as d3.HierarchyRectangularNode<HNode>[],
      )
      .join("path")
      .attr("class", "arc")
      .attr("d", arc)
      .attr("fill", fillColor)
      .attr("fill-opacity", (d) =>
        d.data.kind === "shot" ? 0.82 : 0.55,
      )
      .attr("stroke", BG)
      .attr("stroke-width", 0.5)
      .attr("cursor", (d) =>
        d.children ? "pointer" : "default",
      )
      .on("mouseenter", (event, d) => {
        d3.select(event.currentTarget).attr(
          "fill-opacity",
          d.data.kind === "shot" ? 1 : 0.75,
        );
        const bounds = container.getBoundingClientRect();
        const px = event.clientX - bounds.left;
        const py = event.clientY - bounds.top;

        let text = d.data.name;
        if (d.data.kind === "shot" && d.data.shot) {
          const s = d.data.shot;
          text = `${s.movementType.replace(/_/g, " ")} · ${s.duration.toFixed(1)}s\n${s.shotSize} · Shot ${s.shotIndex}`;
        } else if (d.data.kind === "film") {
          text = `${d.data.name} (${d.children?.length ?? 0} scenes)`;
        }

        setTooltipData({ text, x: px, y: py });
      })
      .on("mouseleave", (event, d) => {
        d3.select(event.currentTarget).attr(
          "fill-opacity",
          d.data.kind === "shot" ? 0.82 : 0.55,
        );
        setTooltipData(null);
      })
      .on("click", (_event, d) => {
        if (!d.children) return;
        clicked(d);
      });

    /* Center circle for navigating back */
    g.append("circle")
      .attr("r", (root as d3.HierarchyRectangularNode<HNode>).y1)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .attr("cursor", "pointer")
      .on("click", () => {
        if (currentRoot.parent) {
          clicked(currentRoot.parent as d3.HierarchyRectangularNode<HNode>);
        }
      });

    /* Center label */
    const centerText = g
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", TEXT)
      .attr("font-family", "ui-monospace, monospace")
      .attr("font-size", 11)
      .attr("pointer-events", "none")
      .text("All");

    /* Film-ring labels */
    g.selectAll<SVGTextElement, d3.HierarchyRectangularNode<HNode>>(
      "text.film-label",
    )
      .data(
        (root.children ?? []).filter(
          (d) => (d as d3.HierarchyRectangularNode<HNode>).x1 - (d as d3.HierarchyRectangularNode<HNode>).x0 > 0.18,
        ) as d3.HierarchyRectangularNode<HNode>[],
      )
      .join("text")
      .attr("class", "film-label")
      .attr("transform", (d) => {
        const angle =
          ((d.x0 + d.x1) / 2 - Math.PI / 2) *
          (180 / Math.PI);
        const r = (d.y0 + d.y1) / 2;
        return `rotate(${angle}) translate(${r},0) rotate(${angle > 90 && angle < 270 ? 180 : 0})`;
      })
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", SECONDARY)
      .attr("font-family", "ui-monospace, monospace")
      .attr("font-size", 8)
      .attr("pointer-events", "none")
      .text((d) => {
        const maxLen = 14;
        return d.data.name.length > maxLen
          ? d.data.name.slice(0, maxLen - 1) + "\u2026"
          : d.data.name;
      });

    /* Click-to-zoom -------------------------------------------------- */

    function clicked(p: d3.HierarchyRectangularNode<HNode>) {
      currentRoot = p;

      /* Build breadcrumb */
      const trail: string[] = [];
      let node: d3.HierarchyRectangularNode<HNode> | null = p;
      while (node) {
        trail.unshift(node.data.name);
        node = node.parent as d3.HierarchyRectangularNode<HNode> | null;
      }
      setBreadcrumb(trail);

      const targetX0 = p.x0;
      const targetX1 = p.x1;
      const targetY0 = p.y0;

      const xScale = (2 * Math.PI) / (targetX1 - targetX0);
      const yScale = radius / (radius - targetY0);

      const t = d3.transition().duration(600);

      paths
        .transition(t)
        .attrTween("d", (d) => {
          const xi = d3.interpolate(d.x0, (d.x0 - targetX0) * xScale);
          const xi1 = d3.interpolate(d.x1, (d.x1 - targetX0) * xScale);
          const yi0 = d3.interpolate(d.y0, Math.max(0, (d.y0 - targetY0) * yScale));
          const yi1 = d3.interpolate(d.y1, Math.max(0, (d.y1 - targetY0) * yScale));
          return (t: number) => {
            d.x0 = xi(t);
            d.x1 = xi1(t);
            d.y0 = yi0(t);
            d.y1 = yi1(t);
            return arc(d) ?? "";
          };
        })
        .attr("fill-opacity", (d) => {
          if (d.x0 >= 2 * Math.PI || d.x1 <= 0) return 0;
          return d.data.kind === "shot" ? 0.82 : 0.55;
        });

      centerText.text(p.data.name);
    }
  }, [rootData]);

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
      <div style={{ padding: "10px 14px 2px" }}>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: CYAN,
          }}
        >
          Film Hierarchy
        </span>
      </div>

      {/* Breadcrumb */}
      <div
        style={{
          padding: "2px 14px 6px",
          fontFamily: "ui-monospace, monospace",
          fontSize: 9,
          color: SECONDARY,
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {breadcrumb.map((label, i) => (
          <span key={i}>
            {i > 0 && (
              <span style={{ color: TERTIARY, margin: "0 2px" }}>/</span>
            )}
            <span
              style={{
                color: i === breadcrumb.length - 1 ? TEXT : SECONDARY,
              }}
            >
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* SVG */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg ref={svgRef} style={{ display: "block" }} />
      </div>

      {/* Tooltip */}
      {tooltipData && (
        <div
          style={{
            position: "absolute",
            left: tooltipData.x + 14,
            top: tooltipData.y - 8,
            pointerEvents: "none",
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
            whiteSpace: "pre-line",
          }}
        >
          {tooltipData.text}
        </div>
      )}
    </div>
  );
}
