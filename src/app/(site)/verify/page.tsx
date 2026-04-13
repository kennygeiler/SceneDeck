import type { Metadata } from "next";
import Link from "next/link";

import { BoundaryTriageWorkspace } from "@/components/verify/boundary-triage-workspace";
import { getVerificationStats } from "@/db/queries";

export const metadata: Metadata = {
  title: "Review",
  description:
    "Cut boundary review: triage shots flagged needs_review with before/after frames, confidence filter, and bulk actions.",
};

export default async function VerifyPage() {
  const stats = await getVerificationStats();

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
            This page is only for <strong className="text-[var(--color-text-primary)]">cut boundary correctness</strong>{" "}
            — shots flagged <code className="font-mono text-[10px]">needs_review</code> after ingest. Use the grid below
            (before/after frames, confidence filter, bulk accept / reject motion). Composition labels (framing, shot size,
            etc.) are model output and are <strong className="text-[var(--color-text-primary)]">not</strong> human-reviewed
            here. From{" "}
            <Link href="/browse" className="text-[var(--color-text-accent)] underline-offset-2 hover:underline">
              Browse
            </Link>{" "}
            → film you can open this page with that film pre-selected. Re-run{" "}
            <Link href="/ingest" className="text-[var(--color-text-accent)] underline-offset-2 hover:underline">
              ingest
            </Link>{" "}
            when a whole timeline needs a fresh pass.
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
            Archive &amp; cut queue
          </p>
          <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
            {stats.totalShots}{" "}
            <span className="text-lg font-normal text-[var(--color-text-tertiary)]">shots total</span>
          </p>
          <p className="mt-2 space-y-1 text-sm text-[var(--color-text-secondary)]">
            <span className="block">
              <span className="font-mono tabular-nums text-[var(--color-text-primary)]">{stats.reviewQueueCount}</span>{" "}
              in cut triage queue (<code className="font-mono text-[10px]">needs_review</code>) — same filter as the grid
              below.
            </span>
            <span className="block text-[var(--color-text-tertiary)]">
              <span className="font-mono tabular-nums text-[var(--color-text-secondary)]">
                {stats.unreviewedMetadataCount}
              </span>{" "}
              shots have <code className="font-mono text-[10px]">unreviewed</code> cut status (pipeline default — not queued
              unless long take or model fallback).
            </span>
          </p>
        </div>
      </section>

      <BoundaryTriageWorkspace />
    </div>
  );
}
