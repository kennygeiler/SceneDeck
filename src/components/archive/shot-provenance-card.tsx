import type { ShotWithDetails } from "@/lib/types";
import {
  formatConfidencePercent,
  formatLabelProvenance,
  formatReviewStatusLabel,
} from "@/lib/archive-trust";

type ShotProvenanceCardProps = {
  shot: ShotWithDetails;
};

function formatVerifiedAt(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ShotProvenanceCard({ shot }: ShotProvenanceCardProps) {
  const { metadata, trust } = shot;

  return (
    <aside
      className="rounded-[var(--radius-xl)] border p-6"
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
        Archive provenance
      </p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
        Model confidence, label origin, and human verification status for this
        record.
      </p>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-[var(--radius-lg)] border p-4"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
          }}
        >
          <dt className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Model confidence
          </dt>
          <dd className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
            {formatConfidencePercent(metadata.confidence)}
          </dd>
        </div>
        <div
          className="rounded-[var(--radius-lg)] border p-4"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
          }}
        >
          <dt className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Labels
          </dt>
          <dd className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
            {formatLabelProvenance(metadata.classificationSource)}
          </dd>
        </div>
        <div
          className="rounded-[var(--radius-lg)] border p-4"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
          }}
        >
          <dt className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Review status
          </dt>
          <dd className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
            {formatReviewStatusLabel(metadata.reviewStatus)}
          </dd>
        </div>
        <div
          className="rounded-[var(--radius-lg)] border p-4"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
          }}
        >
          <dt className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Last human verification
          </dt>
          <dd className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
            {trust?.latestVerifiedAt
              ? formatVerifiedAt(trust.latestVerifiedAt)
              : "—"}
            {trust && trust.verificationCount > 0 ? (
              <span className="mt-1 block font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                {trust.verificationCount} session
                {trust.verificationCount === 1 ? "" : "s"}
                {trust.latestOverallRating != null
                  ? ` · overall ${trust.latestOverallRating}/5`
                  : ""}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
