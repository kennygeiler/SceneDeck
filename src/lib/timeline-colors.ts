import type { MovementTypeSlug } from "@/lib/taxonomy";

/**
 * Distinct OKLCH hues for each movement type, spread across the color wheel.
 * Used in timeline visualizations to make blocks visually distinguishable.
 */
const MOVEMENT_TYPE_COLORS: Record<MovementTypeSlug, string> = {
  static: "oklch(0.55 0.02 260)",
  pan: "oklch(0.72 0.14 200)",
  tilt: "oklch(0.72 0.14 170)",
  dolly: "oklch(0.72 0.16 145)",
  truck: "oklch(0.68 0.14 120)",
  pedestal: "oklch(0.65 0.12 95)",
  crane: "oklch(0.70 0.16 60)",
  boom: "oklch(0.68 0.14 45)",
  zoom: "oklch(0.75 0.18 80)",
  dolly_zoom: "oklch(0.72 0.20 25)",
  handheld: "oklch(0.65 0.10 300)",
  steadicam: "oklch(0.70 0.14 240)",
  drone: "oklch(0.68 0.12 280)",
  aerial: "oklch(0.72 0.14 220)",
  arc: "oklch(0.70 0.16 320)",
  whip_pan: "oklch(0.75 0.20 15)",
  whip_tilt: "oklch(0.73 0.18 350)",
  rack_focus: "oklch(0.68 0.12 180)",
  follow: "oklch(0.70 0.14 155)",
  reveal: "oklch(0.72 0.16 130)",
  reframe: "oklch(0.65 0.10 260)",
};

export function getMovementTypeColor(slug: MovementTypeSlug): string {
  return MOVEMENT_TYPE_COLORS[slug] ?? "oklch(0.55 0.02 260)";
}
