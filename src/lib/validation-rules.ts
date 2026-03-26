// ---------------------------------------------------------------------------
// Post-classification validation rules for MetroVision composition pipeline
// ---------------------------------------------------------------------------

import type { ClassifiedShot } from "@/lib/ingest-pipeline";

export type ValidationResult = {
  isValid: boolean;
  confidence: number; // 0-1
  autoFixes: Array<{ field: string; from: string; to: string; reason: string }>;
  flags: string[];
};

export function validateClassification(
  classification: ClassifiedShot,
  duration: number,
): ValidationResult {
  const flags: string[] = [];
  const autoFixes: Array<{ field: string; from: string; to: string; reason: string }> = [];

  // Rule 1: Very long shots should be long_take
  if (duration > 60 && !["long_take", "oner"].includes(classification.duration_cat)) {
    autoFixes.push({
      field: "duration_cat",
      from: classification.duration_cat,
      to: "long_take",
      reason: "Duration exceeds 60s but category was not long_take/oner",
    });
    classification.duration_cat = "long_take";
  }

  // Rule 2: Sub-second shots should be flash
  if (duration < 1 && classification.duration_cat !== "flash") {
    autoFixes.push({
      field: "duration_cat",
      from: classification.duration_cat,
      to: "flash",
      reason: "Duration under 1s should be categorized as flash",
    });
    classification.duration_cat = "flash";
  }

  // Rule 3: Rare combination flag
  if (
    classification.shot_size === "extreme_wide" &&
    classification.angle_vertical === "worms_eye"
  ) {
    flags.push("rare_extreme_wide_worms_eye");
  }

  // Rule 4: Empty frame should not have foreground elements
  if (
    classification.blocking === "empty" &&
    classification.foreground_elements.length > 0
  ) {
    flags.push("empty_frame_has_foreground");
  }

  // Rule 5: Silhouette should have back/rim lighting
  if (
    classification.blocking === "silhouette" &&
    classification.lighting_direction !== "back"
  ) {
    flags.push("silhouette_without_backlight");
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
