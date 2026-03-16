import {
  DIRECTIONS,
  HORIZONTAL_ANGLES,
  MOVEMENT_TYPES,
  SHOT_SIZES,
  SPEEDS,
  VERTICAL_ANGLES,
} from "@/lib/taxonomy";
import type {
  ShotWithDetails,
  VerificationFieldKey,
  VerificationFieldRatingsMap,
} from "@/lib/types";
import {
  getDirectionDisplayName,
  getHorizontalAngleDisplayName,
  getMovementDisplayName,
  getShotSizeDisplayName,
  getSpeedDisplayName,
  getVerticalAngleDisplayName,
} from "@/lib/shot-display";

export const VERIFICATION_FIELD_LABELS: Record<VerificationFieldKey, string> = {
  movementType: "Movement type",
  direction: "Direction",
  speed: "Speed",
  shotSize: "Shot size",
  angleVertical: "Vertical angle",
  angleHorizontal: "Horizontal angle",
};

type CorrectionOption = {
  value: string;
  label: string;
};

function toOptions(dictionary: Record<string, { slug: string; displayName: string }>) {
  return Object.values(dictionary).map((option) => ({
    value: option.slug,
    label: option.displayName,
  }));
}

export const VERIFICATION_FIELD_OPTIONS: Record<
  VerificationFieldKey,
  CorrectionOption[]
> = {
  movementType: toOptions(MOVEMENT_TYPES),
  direction: toOptions(DIRECTIONS),
  speed: toOptions(SPEEDS),
  shotSize: toOptions(SHOT_SIZES),
  angleVertical: toOptions(VERTICAL_ANGLES),
  angleHorizontal: toOptions(HORIZONTAL_ANGLES),
};

export const VERIFIABLE_FIELDS = (
  Object.keys(VERIFICATION_FIELD_LABELS) as VerificationFieldKey[]
).map((key) => ({
  key,
  label: VERIFICATION_FIELD_LABELS[key],
  options: VERIFICATION_FIELD_OPTIONS[key],
}));

export function getVerificationFieldValue(
  shot: ShotWithDetails,
  field: VerificationFieldKey,
) {
  return shot.metadata[field];
}

export function getVerificationFieldDisplayValue(
  shot: ShotWithDetails,
  field: VerificationFieldKey,
) {
  switch (field) {
    case "movementType":
      return getMovementDisplayName(shot.metadata.movementType);
    case "direction":
      return getDirectionDisplayName(shot.metadata.direction);
    case "speed":
      return getSpeedDisplayName(shot.metadata.speed);
    case "shotSize":
      return getShotSizeDisplayName(shot.metadata.shotSize);
    case "angleVertical":
      return getVerticalAngleDisplayName(shot.metadata.angleVertical);
    case "angleHorizontal":
      return getHorizontalAngleDisplayName(shot.metadata.angleHorizontal);
  }
}

export function getCorrectionDisplayValue(
  field: VerificationFieldKey,
  value: string,
) {
  return VERIFICATION_FIELD_OPTIONS[field].find((option) => option.value === value)?.label ?? value;
}

export function getClassificationSourceLabel(source: string | null) {
  if (!source) {
    return "Manual";
  }

  const normalizedSource = source.trim().toLowerCase();

  if (normalizedSource === "gemini") {
    return "Gemini";
  }

  if (normalizedSource === "raft") {
    return "RAFT";
  }

  if (normalizedSource === "manual") {
    return "Manual";
  }

  return normalizedSource.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getFieldRatingsSummary(
  fieldRatings: VerificationFieldRatingsMap | null,
) {
  if (!fieldRatings) {
    return [];
  }

  return (Object.entries(fieldRatings) as Array<[VerificationFieldKey, number | null]>)
    .filter(([, rating]) => typeof rating === "number")
    .map(([field, rating]) => ({
      field,
      label: VERIFICATION_FIELD_LABELS[field],
      rating,
    }));
}
