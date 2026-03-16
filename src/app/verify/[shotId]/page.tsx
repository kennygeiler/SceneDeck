import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VerificationHistory } from "@/components/verify/verification-history";
import { VerificationPanel } from "@/components/verify/verification-panel";
import { ShotPlayer } from "@/components/video/shot-player";
import { getShotById, getVerificationsForShot } from "@/db/queries";
import { getMovementDisplayName } from "@/lib/shot-display";

type VerifyShotPageProps = {
  params: Promise<{
    shotId: string;
  }>;
};

export async function generateMetadata({
  params,
}: VerifyShotPageProps): Promise<Metadata> {
  const { shotId } = await params;
  const shot = await getShotById(shotId);

  if (!shot) {
    return {
      title: "Verification Not Found",
    };
  }

  return {
    title: `Verify ${shot.film.title}`,
    description: `Review ${getMovementDisplayName(shot.metadata.movementType)} metadata accuracy for ${shot.film.title}.`,
  };
}

export default async function VerifyShotPage({
  params,
}: VerifyShotPageProps) {
  const { shotId } = await params;
  const [shot, verifications] = await Promise.all([
    getShotById(shotId),
    getVerificationsForShot(shotId),
  ]);

  if (!shot) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Shot verification
          </p>
          <h1
            className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {shot.film.title}
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            Review the current metadata, inspect the overlay in context, and record a verification pass for this shot.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/shot/${shot.id}`}
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Open shot detail
          </Link>
          <Link
            href="/verify"
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Back to queue
          </Link>
        </div>
      </section>

      <ShotPlayer shot={shot} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <VerificationPanel shot={shot} />
        <VerificationHistory verifications={verifications} />
      </section>
    </div>
  );
}
