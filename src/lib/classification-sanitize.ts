import type { ClassifiedShot } from "./types";
import {
  BLOCKING_TYPES,
  COLOR_TEMPERATURES,
  DEPTH_TYPES,
  DOMINANT_LINES,
  DURATION_CATEGORIES,
  FRAMINGS,
  HORIZONTAL_ANGLES,
  LIGHTING_DIRECTIONS,
  LIGHTING_QUALITIES,
  SHOT_SIZES,
  SYMMETRY_TYPES,
  VERTICAL_ANGLES,
} from "./taxonomy";

function slugKeys<const T extends Record<string, { slug: string }>>(dict: T): string[] {
  return Object.keys(dict);
}

function coerceTaxonomySlug(raw: unknown, allowed: readonly string[], fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const n = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (allowed.includes(n)) return n;
  const stripped = n.replace(/_shot$/, "").replace(/[-]/g, "_");
  if (allowed.includes(stripped)) return stripped;
  return fallback;
}

/**
 * Coerce Gemini output onto known taxonomy slugs so DB inserts and UI chips stay valid.
 * Unknown values map to conservative defaults (same spirit as fallbackClassification).
 */
export function sanitizeClassifiedShot(c: ClassifiedShot): ClassifiedShot {
  return {
    ...c,
    framing: coerceTaxonomySlug(c.framing, slugKeys(FRAMINGS), "centered"),
    depth: coerceTaxonomySlug(c.depth, slugKeys(DEPTH_TYPES), "medium"),
    blocking: coerceTaxonomySlug(c.blocking, slugKeys(BLOCKING_TYPES), "single"),
    symmetry: coerceTaxonomySlug(c.symmetry, slugKeys(SYMMETRY_TYPES), "balanced"),
    dominant_lines: coerceTaxonomySlug(c.dominant_lines, slugKeys(DOMINANT_LINES), "none"),
    lighting_direction: coerceTaxonomySlug(
      c.lighting_direction,
      slugKeys(LIGHTING_DIRECTIONS),
      "natural",
    ),
    lighting_quality: coerceTaxonomySlug(
      c.lighting_quality,
      slugKeys(LIGHTING_QUALITIES),
      "soft",
    ),
    color_temperature: coerceTaxonomySlug(
      c.color_temperature,
      slugKeys(COLOR_TEMPERATURES),
      "neutral",
    ),
    foreground_elements: Array.isArray(c.foreground_elements) ? c.foreground_elements : [],
    background_elements: Array.isArray(c.background_elements) ? c.background_elements : [],
    shot_size: coerceTaxonomySlug(c.shot_size, slugKeys(SHOT_SIZES), "medium"),
    angle_vertical: coerceTaxonomySlug(c.angle_vertical, slugKeys(VERTICAL_ANGLES), "eye_level"),
    angle_horizontal: coerceTaxonomySlug(
      c.angle_horizontal,
      slugKeys(HORIZONTAL_ANGLES),
      "frontal",
    ),
    duration_cat: coerceTaxonomySlug(c.duration_cat, slugKeys(DURATION_CATEGORIES), "standard"),
    description: typeof c.description === "string" ? c.description : "",
    mood: typeof c.mood === "string" ? c.mood : "neutral",
    lighting: typeof c.lighting === "string" ? c.lighting : "unknown",
    subjects: Array.isArray(c.subjects) ? c.subjects : [],
    scene_title: typeof c.scene_title === "string" ? c.scene_title : "Unclassified",
    scene_description: typeof c.scene_description === "string" ? c.scene_description : "",
    location: typeof c.location === "string" ? c.location : "unknown",
    interior_exterior:
      typeof c.interior_exterior === "string" ? c.interior_exterior : "interior",
    time_of_day: typeof c.time_of_day === "string" ? c.time_of_day : "day",
  };
}
