import type { FramingSlug } from "@/lib/taxonomy";

/**
 * Distinct OKLCH hues for each framing type, spread across the color wheel.
 * Used in timeline visualizations to make blocks visually distinguishable.
 */
const FRAMING_COLORS: Record<FramingSlug, string> = {
  rule_of_thirds_left: "oklch(0.72 0.14 200)",
  rule_of_thirds_right: "oklch(0.72 0.14 170)",
  centered: "oklch(0.55 0.02 260)",
  off_center: "oklch(0.72 0.16 145)",
  split: "oklch(0.68 0.14 120)",
  frame_within_frame: "oklch(0.65 0.12 95)",
  negative_space_dominant: "oklch(0.70 0.16 60)",
  filled: "oklch(0.68 0.14 45)",
  leading_lines: "oklch(0.75 0.18 80)",
  golden_ratio: "oklch(0.72 0.20 25)",
};

export function getFramingColor(slug: string): string {
  return FRAMING_COLORS[slug as FramingSlug] ?? "oklch(0.55 0.02 260)";
}
