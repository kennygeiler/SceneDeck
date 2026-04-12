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
  type BlockingTypeSlug,
  type ColorTemperatureSlug,
  type DepthTypeSlug,
  type DominantLineSlug,
  type DurationCategorySlug,
  type FramingSlug,
  type HorizontalAngleSlug,
  type LightingDirectionSlug,
  type LightingQualitySlug,
  type ShotSizeSlug,
  type SymmetryTypeSlug,
  type VerticalAngleSlug,
} from "@/lib/taxonomy";

const formatFallbackLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

function getDisplayName<T extends Record<string, { displayName: string }>>(
  dictionary: T,
  slug: string | null | undefined,
) {
  if (!slug) return "—";
  return dictionary[slug as keyof T]?.displayName ?? formatFallbackLabel(slug);
}

export function getFramingDisplayName(slug: FramingSlug | null | undefined) {
  return getDisplayName(FRAMINGS, slug);
}

export function getDepthDisplayName(slug: DepthTypeSlug | null | undefined) {
  return getDisplayName(DEPTH_TYPES, slug);
}

export function getBlockingDisplayName(slug: BlockingTypeSlug | null | undefined) {
  return getDisplayName(BLOCKING_TYPES, slug);
}

export function getSymmetryDisplayName(slug: SymmetryTypeSlug | null | undefined) {
  return getDisplayName(SYMMETRY_TYPES, slug);
}

export function getDominantLineDisplayName(slug: DominantLineSlug | null | undefined) {
  return getDisplayName(DOMINANT_LINES, slug);
}

export function getLightingDirectionDisplayName(slug: LightingDirectionSlug | null | undefined) {
  return getDisplayName(LIGHTING_DIRECTIONS, slug);
}

export function getLightingQualityDisplayName(slug: LightingQualitySlug | null | undefined) {
  return getDisplayName(LIGHTING_QUALITIES, slug);
}

export function getColorTemperatureDisplayName(slug: ColorTemperatureSlug | null | undefined) {
  return getDisplayName(COLOR_TEMPERATURES, slug);
}

export function getShotSizeDisplayName(slug: ShotSizeSlug | null | undefined) {
  return getDisplayName(SHOT_SIZES, slug);
}

export function getVerticalAngleDisplayName(slug: VerticalAngleSlug | null | undefined) {
  return getDisplayName(VERTICAL_ANGLES, slug);
}

export function getHorizontalAngleDisplayName(slug: HorizontalAngleSlug | null | undefined) {
  return getDisplayName(HORIZONTAL_ANGLES, slug);
}

export function getDurationCategoryDisplayName(slug: DurationCategorySlug | null | undefined) {
  return getDisplayName(DURATION_CATEGORIES, slug);
}

/**
 * Video-player style clock (no trailing `s`): `0:04`, `0:04.3`, `1:02`, `1:02:03`.
 */
export function formatMediaClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "0:00";
  }
  const t = Math.min(sec, 359999);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t - h * 3600 - m * 60;
  const si = Math.floor(s + 1e-9);
  const frac = s - si;
  const ss =
    frac > 0.001
      ? `${String(si).padStart(2, "0")}${frac.toFixed(1).slice(1)}`
      : String(si).padStart(2, "0");
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  }
  return `${m}:${ss}`;
}

export function formatShotDuration(duration: number) {
  if (!Number.isFinite(duration) || duration < 0) {
    return "—";
  }
  return formatMediaClock(duration);
}

/** Browse card: minutes only under 1h; `2h 39m` when an hour or more. */
export function formatFilmCardTotalDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "—";
  }
  const s = Math.round(totalSeconds);
  if (s === 0) {
    return "0m";
  }
  if (s < 3600) {
    return `${Math.round(s / 60)}m`;
  }
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}
