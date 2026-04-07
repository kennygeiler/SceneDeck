import Link from "next/link";

import { ArchiveDemoSliceActions } from "@/components/archive/archive-demo-slice-actions";
import { MethodologyBlurb } from "@/components/archive/methodology-blurb";
import type { VerificationStats } from "@/lib/types";

type ArchiveDemoSliceProps = {
  stats: VerificationStats;
  framingTypeCount: number;
  spotlightShotId: string | null;
};

export function ArchiveDemoSlice({
  stats,
  framingTypeCount,
  spotlightShotId,
}: ArchiveDemoSliceProps) {
  const vizHref = "/visualize#composition-scatter";
  const exportHref = spotlightShotId
    ? `/export?demoShot=${encodeURIComponent(spotlightShotId)}`
    : "/export";

  return (
    <section
      className="space-y-8 rounded-[calc(var(--radius-xl)_+_4px)] border p-8 sm:p-10"
      style={{
        borderColor:
          "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        background:
          "linear-gradient(160deg, color-mix(in oklch, var(--color-surface-secondary) 78%, transparent), color-mix(in oklch, var(--color-surface-primary) 94%, transparent))",
      }}
      aria-labelledby="demo-slice-heading"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div>
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Minimum impressive demo
          </p>
          <h2
            id="demo-slice-heading"
            className="mt-3 text-3xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            One path through real data
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
            Browse the archive, open a shot with provenance, inspect composition
            patterns in a single chart, then export with a ready-made citation.
          </p>

          <ol className="mt-8 space-y-4 text-sm text-[var(--color-text-secondary)]">
            <li className="flex gap-3">
              <span className="font-mono text-[var(--color-text-accent)]">01</span>
              <span>
                <Link
                  href="/browse"
                  className="font-medium text-[var(--color-text-primary)] underline-offset-4 hover:underline"
                >
                  Browse
                </Link>{" "}
                — filter records from the live database.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[var(--color-text-accent)]">02</span>
              <span>
                {spotlightShotId ? (
                  <>
                    <Link
                      href={`/shot/${spotlightShotId}`}
                      className="font-medium text-[var(--color-text-primary)] underline-offset-4 hover:underline"
                    >
                      Shot detail
                    </Link>{" "}
                    — playback, metadata, model confidence, review status,
                    last verification.
                  </>
                ) : (
                  <>
                    <span className="text-[var(--color-text-tertiary)]">
                      Shot detail
                    </span>{" "}
                    — seed the archive to link a featured shot here.
                  </>
                )}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[var(--color-text-accent)]">03</span>
              <span>
                <Link
                  href={vizHref}
                  className="font-medium text-[var(--color-text-primary)] underline-offset-4 hover:underline"
                >
                  Visualize
                </Link>{" "}
                — composition scatter (framing × depth) across the archive.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[var(--color-text-accent)]">04</span>
              <span>
                <Link
                  href={exportHref}
                  className="font-medium text-[var(--color-text-primary)] underline-offset-4 hover:underline"
                >
                  Export
                </Link>{" "}
                — JSON/CSV plus a copyable citation block.
              </span>
            </li>
          </ol>

          <ArchiveDemoSliceActions spotlightShotId={spotlightShotId} />
        </div>

        <MethodologyBlurb
          stats={stats}
          framingTypeCount={framingTypeCount}
          className="rounded-[var(--radius-xl)] border p-6"
        />
      </div>
    </section>
  );
}
