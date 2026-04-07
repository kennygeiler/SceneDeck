import type { VerificationStats } from "@/lib/types";
import { humanReviewArchivePercent } from "@/lib/archive-trust";

type MethodologyBlurbProps = {
  stats: VerificationStats;
  framingTypeCount: number;
  className?: string;
};

export function MethodologyBlurb({
  stats,
  framingTypeCount,
  className,
}: MethodologyBlurbProps) {
  const reviewPct = humanReviewArchivePercent(
    stats.verifiedShots,
    stats.totalShots,
  );

  return (
    <div
      className={className}
      style={{
        background:
          "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 84%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
      }}
    >
      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
        Methodology (live archive)
      </p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">
        Shots carry a fixed composition taxonomy (for example{" "}
        <span className="text-[var(--color-text-primary)]">
          {framingTypeCount} framing types
        </span>
        ), plus depth, blocking, lighting, shot size, and angles. Labels may be
        hand-entered or model-assist;{" "}
        <span className="text-[var(--color-text-primary)]">
          {reviewPct}% of archive shots
        </span>{" "}
        have at least one human verification event (
        {stats.verifiedShots.toLocaleString()} /{" "}
        {stats.totalShots.toLocaleString()}). Exports include fields suitable for
        reproducible citations.
      </p>
    </div>
  );
}
