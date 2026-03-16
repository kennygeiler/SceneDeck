import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ShotPlayer } from "@/components/video/shot-player";
import {
  formatShotDuration,
  getCompoundNotation,
  getDirectionDisplayName,
  getDurationCategoryDisplayName,
  getHorizontalAngleDisplayName,
  getMovementDisplayName,
  getShotSizeDisplayName,
  getSpeedDisplayName,
  getVerticalAngleDisplayName,
} from "@/lib/shot-display";
import { getMockShotById, mockShots } from "@/lib/mock/shots";

type ShotDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export async function generateMetadata({
  params,
}: ShotDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const shot = getMockShotById(id);

  if (!shot) {
    return {
      title: "Shot Not Found",
    };
  }

  return {
    title: `${shot.film.title} • ${getMovementDisplayName(shot.metadata.movementType)}`,
    description: `${shot.film.title} (${shot.film.year}) with ${getMovementDisplayName(shot.metadata.movementType)} movement rendered in the SceneDeck overlay.`,
  };
}

export function generateStaticParams() {
  return mockShots.map((shot) => ({ id: shot.id }));
}

export default async function ShotDetailPage({ params }: ShotDetailPageProps) {
  const { id } = await params;
  const shot = getMockShotById(id);

  if (!shot) {
    notFound();
  }

  const metadataFields = [
    {
      label: "Movement type",
      value: getMovementDisplayName(shot.metadata.movementType),
    },
    {
      label: "Direction",
      value: getDirectionDisplayName(shot.metadata.direction),
    },
    {
      label: "Speed",
      value: getSpeedDisplayName(shot.metadata.speed),
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
    {
      label: "Compound movement",
      value:
        shot.metadata.isCompound && shot.metadata.compoundParts
          ? getCompoundNotation(shot.metadata.compoundParts)
          : "No",
    },
  ] as const;

  return (
    <div className="space-y-10">
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
            {shot.film.director} · {shot.film.year} · {shot.id}
          </p>
        </div>

        <Link
          href="/browse"
          className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
        >
          Back to browse
        </Link>
      </section>

      <ShotPlayer shot={shot} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
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
                <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                  {field.value}
                </p>
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
            Clip note
          </p>
          <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
            This view uses synthetic playback artwork only. Once media ingestion
            is added, the same overlay will render on top of real clips and stay
            synchronized with playback time.
          </p>
        </aside>
      </section>
    </div>
  );
}
