import {
  DIRECTIONS,
  DURATION_CATEGORIES,
  HORIZONTAL_ANGLES,
  MOVEMENT_TYPES,
  SHOT_SIZES,
  SPEEDS,
  VERTICAL_ANGLES,
  type DirectionSlug,
  type DurationCategorySlug,
  type HorizontalAngleSlug,
  type MovementTypeSlug,
  type ShotSizeSlug,
  type SpeedSlug,
  type VerticalAngleSlug,
} from "@/lib/taxonomy";

const formatFallbackLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

function getDisplayName<T extends Record<string, { displayName: string }>>(
  dictionary: T,
  slug: string,
) {
  return dictionary[slug as keyof T]?.displayName ?? formatFallbackLabel(slug);
}

export function getMovementDisplayName(slug: MovementTypeSlug) {
  return getDisplayName(MOVEMENT_TYPES, slug);
}

export function getDirectionDisplayName(slug: DirectionSlug) {
  return getDisplayName(DIRECTIONS, slug);
}

export function getSpeedDisplayName(slug: SpeedSlug) {
  return getDisplayName(SPEEDS, slug);
}

export function getShotSizeDisplayName(slug: ShotSizeSlug) {
  return getDisplayName(SHOT_SIZES, slug);
}

export function getVerticalAngleDisplayName(slug: VerticalAngleSlug) {
  return getDisplayName(VERTICAL_ANGLES, slug);
}

export function getHorizontalAngleDisplayName(slug: HorizontalAngleSlug) {
  return getDisplayName(HORIZONTAL_ANGLES, slug);
}

export function getDurationCategoryDisplayName(slug: DurationCategorySlug) {
  return getDisplayName(DURATION_CATEGORIES, slug);
}

export function formatShotDuration(duration: number) {
  return `${duration.toFixed(1)}s`;
}

export function getCompoundNotation(
  compoundParts: Array<{ type: MovementTypeSlug; direction: DirectionSlug }>,
) {
  return compoundParts.map((part) => `${part.type}:${part.direction}`).join(" + ");
}

export const SPEED_PROGRESS: Record<SpeedSlug, number> = {
  freeze: 0.04,
  imperceptible: 0.12,
  slow: 0.32,
  moderate: 0.54,
  fast: 0.74,
  very_fast: 0.88,
  snap: 1,
};
