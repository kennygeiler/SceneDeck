import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getAccuracyStats, getShotsForReview, getVerificationStats } from "@/db/queries";
import { getFramingDisplayName } from "@/lib/shot-display";

export const metadata: Metadata = {
  title: "Verify Queue",
  description: "Review MetroVision shots, rate classifier accuracy, and correct metadata.",
};

function formatAverageRating(value: number | null) {
  return value === null ? "Unrated" : `${value.toFixed(1)}/5`;
}

export default async function VerifyPage() {
  const [shotsForReview, stats, accuracy] = await Promise.all([
    getShotsForReview(),
    getVerificationStats(),
    getAccuracyStats(),
  ]);

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            QA verification workflow
          </p>
          <h1
            className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Review queue
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            Inspect shots, rate the current AI pass, and route low-confidence classifications back into a corrected metadata record.
          </p>
        </div>

        <Link
          href="/browse"
          className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          Browse archive
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
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
            Total shots
          </p>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
            {stats.totalShots}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {stats.reviewQueueCount} currently require human review.
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
            Verified shots
          </p>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
            {stats.verifiedShots}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {stats.unverifiedShots} still have no review record.
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
            Average accuracy
          </p>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
            {formatAverageRating(stats.averageOverallRating)}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {stats.totalVerifications} total review passes recorded.
          </p>
        </div>
      </section>

      {accuracy.totalShotsReviewed > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2
              className="text-xl font-semibold tracking-[var(--letter-spacing-snug)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Classification accuracy
            </h2>
            <p className="font-mono text-xs text-[var(--color-text-tertiary)]">
              {accuracy.totalShotsReviewed} shots reviewed &middot;{" "}
              {accuracy.totalCorrections} corrections
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
                    accuracy.overallAccuracy !== null &&
                    accuracy.overallAccuracy >= 85
                      ? "var(--color-status-verified)"
                      : "var(--color-text-primary)",
                }}
              >
                {accuracy.overallAccuracy !== null
                  ? `${accuracy.overallAccuracy}%`
                  : "N/A"}
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {accuracy.overallAccuracy !== null &&
                accuracy.overallAccuracy >= 85
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
                {Object.entries(accuracy.perFieldAccuracy).map(
                  ([field, pct]) => (
                    <div key={field} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                        {field}
                      </span>
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
                  ),
                )}
              </div>
            </div>
          </div>

          {Object.keys(accuracy.perFilmAccuracy).length > 0 && (
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
                    <div
                      key={film}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-[var(--color-text-secondary)]">
                        {film}
                      </span>
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
          )}
        </section>
      )}

      {shotsForReview.length === 0 ? (
        <section
          className="rounded-[var(--radius-xl)] border border-dashed p-8 text-center"
          style={{
            backgroundColor:
              "color-mix(in oklch, var(--color-surface-secondary) 72%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--color-border-default) 54%, transparent)",
          }}
        >
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-status-verified)]">
            Queue clear
          </p>
          <h2
            className="mt-4 text-3xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            All shots are currently verified
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
            Every shot in the archive has at least one acceptable verification pass. Revisit a shot detail page if you want to add more annotations.
          </p>
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {shotsForReview.map((shot) => (
            <Link
              key={shot.id}
              href={`/verify/${shot.id}`}
              className="group overflow-hidden rounded-[var(--radius-xl)] border transition-transform duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-xl)]"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <div className="relative aspect-video overflow-hidden border-b border-[var(--color-border-subtle)]">
                {shot.thumbnailUrl ? (
                  <Image
                    aria-hidden="true"
                    alt=""
                    src={shot.thumbnailUrl}
                    fill
                    sizes="(min-width: 1024px) 560px, 100vw"
                    className="absolute inset-0 object-cover opacity-60"
                  />
                ) : null}
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(circle at 18% 20%, color-mix(in oklch, var(--color-overlay-arrow) 18%, transparent) 0%, transparent 24%), radial-gradient(circle at 82% 18%, color-mix(in oklch, var(--color-overlay-trajectory) 18%, transparent) 0%, transparent 22%), linear-gradient(135deg, color-mix(in oklch, var(--color-surface-tertiary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
                  }}
                />
                <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
                  <span
                    className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]"
                    style={{
                      backgroundColor:
                        "color-mix(in oklch, var(--color-overlay-arrow) 28%, transparent)",
                      borderColor:
                        "color-mix(in oklch, var(--color-overlay-arrow) 82%, transparent)",
                    }}
                  >
                    {getFramingDisplayName(shot.metadata.framing)}
                  </span>
                  <span
                    className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)]"
                    style={{
                      color:
                        shot.verificationCount === 0
                          ? "var(--color-status-unverified)"
                          : "var(--color-text-primary)",
                      backgroundColor:
                        shot.verificationCount === 0
                          ? "color-mix(in oklch, var(--color-status-unverified) 14%, transparent)"
                          : "color-mix(in oklch, var(--color-status-verified) 14%, transparent)",
                      borderColor:
                        shot.verificationCount === 0
                          ? "color-mix(in oklch, var(--color-status-unverified) 42%, transparent)"
                          : "color-mix(in oklch, var(--color-status-verified) 42%, transparent)",
                    }}
                  >
                    {shot.verificationCount === 0 ? "Unverified" : "Needs attention"}
                  </span>
                </div>

                <div className="absolute inset-x-4 bottom-4">
                  <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    {shot.film.director}
                  </p>
                  <p
                    className="mt-1 text-xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {shot.film.title}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:grid-cols-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Confidence
                  </p>
                  <p
                    className="mt-2 text-sm"
                    style={{
                      color:
                        shot.metadata.confidence === null
                          ? "var(--color-text-tertiary)"
                          : shot.metadata.confidence < 0.5
                            ? "var(--color-status-unverified)"
                            : "var(--color-text-primary)",
                    }}
                  >
                    {shot.metadata.confidence === null
                      ? "N/A"
                      : `${(shot.metadata.confidence * 100).toFixed(0)}%`}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Avg rating
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                    {formatAverageRating(shot.averageOverallRating)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Verifications
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                    {shot.verificationCount}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Review action
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-accent)] transition-transform duration-300 group-hover:translate-x-1">
                    Open verification
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
