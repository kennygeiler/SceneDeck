/** Labels and copy for archive provenance / trust surfaces (no DB imports). */

export function formatReviewStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "human_verified":
      return "Cut accepted";
    case "human_corrected":
      return "Legacy composition edit";
    case "needs_review":
      return "Needs cut review";
    case "boundary_motion_rejected":
      return "Not a cut (motion artifact)";
    case "unreviewed":
    case null:
    case undefined:
      return "No cut triage";
    default:
      return status.replace(/_/g, " ");
  }
}

export function formatLabelProvenance(source: string | null | undefined): string {
  if (!source) return "Unknown origin";
  const s = source.toLowerCase();
  if (s === "manual") return "Hand labels";
  if (s === "gemini") return "Model-assist (Gemini)";
  return source;
}

export function formatConfidencePercent(confidence: number | null | undefined): string {
  if (confidence == null || Number.isNaN(confidence)) return "—";
  const pct = confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence);
  return `${pct}%`;
}

export function humanReviewArchivePercent(verifiedShots: number, totalShots: number): string {
  if (totalShots <= 0) return "0";
  return `${Math.round((verifiedShots / totalShots) * 100)}`;
}
