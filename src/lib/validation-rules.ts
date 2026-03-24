// ---------------------------------------------------------------------------
// Post-classification validation rules for MetroVision pipeline
// ---------------------------------------------------------------------------

import type { ClassifiedShot } from "@/lib/ingest-pipeline";

export type ValidationResult = {
  isValid: boolean;
  confidence: number; // 0-1
  autoFixes: Array<{ field: string; from: string; to: string; reason: string }>;
  flags: string[];
};

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

export function validateClassification(
  classification: ClassifiedShot,
  duration: number,
): ValidationResult {
  const flags: string[] = [];
  const autoFixes: Array<{ field: string; from: string; to: string; reason: string }> = [];

  // Rule 1: Short duration with unusual movement
  const whipMovements = new Set(["whip_pan", "whip_tilt", "rack_focus"]);
  if (duration < 1 && !whipMovements.has(classification.movement_type)) {
    flags.push("short_duration_unusual_movement");
  }

  // Rule 2: Very long shots should be long_take
  const longTakeCats = new Set(["long_take", "oner"]);
  if (duration > 60 && !longTakeCats.has(classification.duration_cat)) {
    autoFixes.push({
      field: "duration_cat",
      from: classification.duration_cat,
      to: "long_take",
      reason: "Duration exceeds 60s but category was not long_take/oner",
    });
    flags.push("duration_cat_mismatch");
    classification.duration_cat = "long_take";
  }

  // Rule 3: Sub-second shots should be flash
  if (duration < 1 && classification.duration_cat !== "flash") {
    autoFixes.push({
      field: "duration_cat",
      from: classification.duration_cat,
      to: "flash",
      reason: "Duration under 1s should be categorized as flash",
    });
    classification.duration_cat = "flash";
  }

  // Rule 4: 1-3 second shots should be brief
  const briefCats = new Set(["flash", "brief"]);
  if (
    duration >= 1 &&
    duration <= 3 &&
    !briefCats.has(classification.duration_cat)
  ) {
    autoFixes.push({
      field: "duration_cat",
      from: classification.duration_cat,
      to: "brief",
      reason: "Duration 1-3s should be categorized as flash or brief",
    });
    classification.duration_cat = "brief";
  }

  // Rule 5: Compound shots must have parts
  if (
    classification.is_compound &&
    (!classification.compound_parts || classification.compound_parts.length === 0)
  ) {
    flags.push("compound_no_parts");
  }

  // Rule 6: Dolly zoom cannot be frozen
  if (
    classification.movement_type === "dolly_zoom" &&
    classification.speed === "freeze"
  ) {
    flags.push("impossible_dolly_zoom_freeze");
  }

  // Rule 7: Static movement should have no direction
  if (
    classification.movement_type === "static" &&
    classification.direction !== "none"
  ) {
    autoFixes.push({
      field: "direction",
      from: classification.direction,
      to: "none",
      reason: "Static movement cannot have a direction",
    });
    classification.direction = "none";
  }

  // Rule 8: Rare combination flag
  if (
    classification.shot_size === "extreme_wide" &&
    classification.angle_vertical === "worms_eye"
  ) {
    flags.push("rare_extreme_wide_worms_eye");
  }

  // Confidence scoring
  let confidence = 1.0;
  confidence -= flags.length * 0.15;
  confidence -= autoFixes.length * 0.05;
  confidence = Math.max(confidence, 0.1);

  return {
    isValid: flags.length === 0,
    confidence,
    autoFixes,
    flags,
  };
}
