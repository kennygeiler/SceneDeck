import type { Metadata } from "next";
import Link from "next/link";

import { BoundaryTriageWorkspace } from "@/components/verify/boundary-triage-workspace";
import { getAccuracyStats, getVerificationStats } from "@/db/queries";

export const metadata: Metadata = {
  title: "Review",
  description:
    "Cut boundary review: triage shots flagged needs_review with before/after frames, confidence filter, and bulk actions.",
};

export default async function VerifyPage() {
  const [stats, accuracy] = await Promise.all([getVerificationStats(), getAccuracyStats()]);

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Cut boundaries
          </p>
          <h1
            className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Review
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            This page is for <strong className="text-[var(--color-text-primary)]">open cut boundaries</strong> — shots
            flagged <code className="font-mono text-[10px]">needs_review</code> in metadata. Use the grid below
            (before/after frames, confidence filter, clusters, bulk approve/reject). From{" "}
            <Link href="/browse" className="text-[var(--color-text-accent)] underline-offset-2 hover:underline">
              Browse
            </Link>{" "}
            → film you can jump here with that film pre-selected. Re-run{" "}
            <Link href="/ingest" className="text-[var(--color-text-accent)] underline-offset-2 hover:underline">
              ingest
            </Link>{" "}
            when a whole timeline needs a fresh pass. Optional per-shot composition QA still lives on each shot’s{" "}
            <code className="font-mono text-[10px]">/verify/[shotId]</code> page.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/browse"
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-accent-base)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-tertiary)]"
          >
            Browse films
          </Link>
          <Link
            href="/ingest"
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Ingest
          </Link>
        </div>
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-6"
        style={{
          backgroundColor: "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
          borderColor: "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <h2
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]"
        >
          Where to look
        </h2>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <li>
            <Link href="/browse" className="text-[var(--color-text-accent)] underline-offset-2 hover:underline">
              Browse
            </Link>{" "}
            → film → <strong className="text-[var(--color-text-primary)]">Shot timeline</strong> for story order;
            striped segments often need re-classification or show up here as <code className="font-mono text-[10px]">needs_review</code>.
          </li>
          <li>
            Use <strong className="text-[var(--color-text-primary)]">Open ingest (film pre-filled)</strong> on the film
            page to queue the same title again (replaces shots for that film when ingest completes).
          </li>
          <li>
            The legacy batch grid URL <code className="font-mono text-[10px]">/verify/batch</code> redirects to this
            page.
          </li>
        </ul>
      </section>

      <section>
        <div
          className="max-w-md rounded-[var(--radius-xl)] border p-5"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
          }}
        >
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Archive &amp; boundary queue
          </p>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
            {stats.totalShots}{" "}
            <span className="text-lg font-normal text-[var(--color-text-tertiary)]">shots total</span>
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            <span className="font-mono tabular-nums text-[var(--color-text-primary)]">{stats.reviewQueueCount}</span>{" "}
            flagged <code className="font-mono text-[10px]">needs_review</code> for cut triage (same filter as the grid
            below).
          </p>
        </div>
      </section>

      <BoundaryTriageWorkspace />

      {accuracy.totalShotsReviewed > 0 ? (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2
              className="text-xl font-semibold tracking-[var(--letter-spacing-snug)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Optional QA accuracy
            </h2>
            <p className="font-mono text-xs text-[var(--color-text-tertiary)]">
              {accuracy.totalShotsReviewed} shots with reviews &middot; {accuracy.totalCorrections} corrections
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div
              className="rounded-[var(--radius-xl)] border p-5"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Overall accuracy
              </p>
              <p
                className="mt-3 text-3xl font-semibold"
                style={{
                  color:
                    accuracy.overallAccuracy !== null && accuracy.overallAccuracy >= 85
                      ? "var(--color-status-verified)"
                      : "var(--color-text-primary)",
                }}
              >
                {accuracy.overallAccuracy !== null ? `${accuracy.overallAccuracy}%` : "N/A"}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {accuracy.overallAccuracy !== null && accuracy.overallAccuracy >= 85
                  ? "M3 gate: passing (>= 85%)"
                  : "M3 gate: not yet passing (< 85%)"}
              </p>
            </div>

            <div
              className="rounded-[var(--radius-xl)] border p-5"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Per-field accuracy
              </p>
              <div className="mt-3 space-y-2">
                {Object.entries(accuracy.perFieldAccuracy).map(([field, pct]) => (
                  <div key={field} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-[var(--color-text-secondary)]">{field}</span>
                    <span
                      className="font-semibold"
                      style={{
                        color:
                          pct !== null && pct >= 85
                            ? "var(--color-status-verified)"
                            : "var(--color-text-primary)",
                      }}
                    >
                      {pct !== null ? `${pct}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {Object.keys(accuracy.perFilmAccuracy).length > 0 ? (
            <div
              className="rounded-[var(--radius-xl)] border p-5"
              style={{
                backgroundColor:
                  "color-mix(in oklch, var(--color-surface-secondary) 78%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Per-film accuracy
              </p>
              <div className="mt-3 space-y-2">
                {Object.entries(accuracy.perFilmAccuracy)
                  .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                  .map(([film, pct]) => (
                    <div key={film} className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-text-secondary)]">{film}</span>
                      <span
                        className="font-mono font-semibold"
                        style={{
                          color:
                            pct !== null && pct >= 85
                              ? "var(--color-status-verified)"
                              : "var(--color-text-primary)",
                        }}
                      >
                        {pct !== null ? `${pct}%` : "—"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
