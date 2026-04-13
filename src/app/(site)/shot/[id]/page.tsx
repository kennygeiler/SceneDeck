import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getNextShotAfterBoundary, getShotById } from "@/db/queries";
import { ShotDetailSuppressSpaceScroll } from "@/components/shots/shot-detail-suppress-space-scroll";
import { ShotDetailVideoBlock } from "@/components/shots/shot-detail-video-block";
import {
  formatShotDuration,
  getBlockingDisplayName,
  getDepthDisplayName,
  getDurationCategoryDisplayName,
  getFramingDisplayName,
  getHorizontalAngleDisplayName,
  getShotSizeDisplayName,
  getVerticalAngleDisplayName,
} from "@/lib/shot-display";

type ShotDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: ShotDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const shot = await getShotById(id);

  if (!shot) {
    return {
      title: "Shot Not Found",
    };
  }

  return {
    title: `${shot.film.title} • ${getFramingDisplayName(shot.metadata.framing)}`,
    description:
      shot.semantic?.description ??
      `${shot.film.title} (${shot.film.year ?? "Unknown year"}) — ${getFramingDisplayName(shot.metadata.framing)} framing analyzed in the MetroVision overlay.`,
  };
}

export default async function ShotDetailPage({ params }: ShotDetailPageProps) {
  const { id } = await params;
  const shot = await getShotById(id);

  if (!shot) {
    notFound();
  }

  const nextShot =
    shot.endTc != null
      ? await getNextShotAfterBoundary(shot.film.id, shot.endTc)
      : null;

  const metadataFields = [
    {
      label: "Framing",
      value: getFramingDisplayName(shot.metadata.framing),
    },
    {
      label: "Depth",
      value: getDepthDisplayName(shot.metadata.depth),
    },
    {
      label: "Blocking",
      value: getBlockingDisplayName(shot.metadata.blocking),
    },
    {
      label: "Shot size",
      value: getShotSizeDisplayName(shot.metadata.shotSize),
    },
    {
      label: "Vertical angle",
      value: getVerticalAngleDisplayName(shot.metadata.angleVertical),
    },
    {
      label: "Horizontal angle",
      value: getHorizontalAngleDisplayName(shot.metadata.angleHorizontal),
    },
    {
      label: "Duration category",
      value: getDurationCategoryDisplayName(shot.metadata.durationCategory),
    },
    {
      label: "Duration",
      value: formatShotDuration(shot.duration),
    },
  ] as const;

  return (
    <div className="space-y-12">
      <ShotDetailSuppressSpaceScroll />
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Shot detail
          </p>
          <h1
            className="mt-4 text-4xl font-bold tracking-[var(--letter-spacing-tight)] sm:text-5xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {shot.film.title}
          </h1>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            {shot.film.director} · {shot.film.year ?? "Unknown year"} · {shot.id}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/verify?filmId=${shot.film.id}`}
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Cut review
          </Link>
          <Link
            href="/browse"
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Back to browse
          </Link>
        </div>
      </section>

      {/* Playback: video + timeline + boundary HITL — visually separated from DB-backed record below */}
      <section
        className="rounded-[calc(var(--radius-xl)_+_4px)] border-2 p-6 sm:p-8"
        style={{
          background:
            "linear-gradient(165deg, color-mix(in oklch, var(--color-surface-secondary) 92%, transparent) 0%, color-mix(in oklch, var(--color-surface-primary) 88%, transparent) 100%)",
          borderColor: "color-mix(in oklch, var(--color-accent-light) 38%, var(--color-border-default))",
          boxShadow:
            "0 0 0 1px color-mix(in oklch, var(--color-accent-light) 12%, transparent), var(--shadow-lg)",
        }}
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--color-border-subtle)] pb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-accent-light)]">
              Playback & boundaries
            </p>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Clip, timeline, and split/merge tools. This panel is for reviewing media, not the stored composition grid.
            </p>
          </div>
        </div>
        <ShotDetailVideoBlock shot={shot} nextShotId={nextShot?.id ?? null} />
      </section>

      {/* Static composition record from the archive */}
      <section className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
          Composition record
        </p>
        <p className="max-w-2xl text-sm text-[var(--color-text-secondary)]">
          Values below are the saved shot row and semantic fields (no live video controls).
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <div
            className="rounded-[var(--radius-xl)] border p-6"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Structured metadata
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {metadataFields.map((field) => (
                <div
                  key={field.label}
                  className="rounded-[var(--radius-lg)] border p-4"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                    borderColor:
                      "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
                  }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    {field.label}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-primary)]">{field.value}</p>
                </div>
              ))}
            </div>
          </div>

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
              Semantic note
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
              {shot.semantic?.description ??
                "A semantic description has not been attached to this shot yet."}
            </p>
            {shot.semantic?.techniqueNotes ? (
              <p className="mt-4 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] p-4 text-sm leading-7 text-[var(--color-text-secondary)]">
                {shot.semantic.techniqueNotes}
              </p>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
