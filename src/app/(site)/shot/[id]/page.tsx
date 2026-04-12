import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getNextShotAfterBoundary, getShotById } from "@/db/queries";
import { ShotProvenanceCard } from "@/components/archive/shot-provenance-card";
import { BoundaryHitlTools } from "@/components/shots/boundary-hitl-tools";
import { ShotPlayer } from "@/components/video/shot-player";
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

function getObjectCategoryColor(category: string | null) {
  switch (category) {
    case "person":
      return "var(--color-overlay-object-person)";
    case "vehicle":
      return "var(--color-overlay-object-vehicle)";
    case "animal":
      return "var(--color-overlay-object-animal)";
    case "furniture":
      return "var(--color-overlay-object-furniture)";
    case "food":
      return "var(--color-overlay-object-food)";
    case "object":
      return "var(--color-overlay-object-default)";
    default:
      return "var(--color-overlay-object-default)";
  }
}

function formatSceneValue(value: string | undefined | null) {
  return value ? value.replace(/_/gu, " ") : "Unknown";
}

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
  const sceneContext =
    shot.objects.find((object) => object.sceneContext)?.sceneContext ?? null;

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
            {shot.film.director} · {shot.film.year ?? "Unknown year"} · {shot.id}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/verify/${shot.id}`}
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Verify this shot
          </Link>
          <Link
            href="/browse"
            className="inline-flex h-7 items-center justify-center rounded-full border border-[var(--color-border-default)] bg-transparent px-4 text-[0.8rem] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Back to browse
          </Link>
        </div>
      </section>

      <ShotProvenanceCard shot={shot} />

      <ShotPlayer shot={shot} />

      <BoundaryHitlTools
        shotId={shot.id}
        startTc={shot.startTc}
        endTc={shot.endTc}
        nextShotId={nextShot?.id ?? null}
      />

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
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-6"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Objects
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Scene detections
            </h2>
          </div>
          <span className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-secondary)]">
            {shot.objects.length} {shot.objects.length === 1 ? "track" : "tracks"}
          </span>
        </div>

        {shot.objects.length > 0 ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shot.objects.map((object) => {
              const color = getObjectCategoryColor(object.category);
              const attributes = Object.entries(object.attributes ?? {});
              const confidence = Math.max(
                0,
                Math.min(
                  100,
                  Math.round((object.yoloConfidence ?? object.confidence ?? 0) * 100),
                ),
              );

              return (
                <article
                  key={object.id}
                  className="rounded-[var(--radius-lg)] border p-4"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                    borderColor:
                      "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {object.cinematicLabel ?? object.label}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)]"
                          style={{
                            color,
                            backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
                            borderColor: `color-mix(in oklch, ${color} 46%, transparent)`,
                          }}
                        >
                          {object.category ?? "untyped"}
                        </span>
                        {object.yoloClass ? (
                          <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                            {object.yoloClass.replace(/_/gu, " ")}
                          </span>
                        ) : null}
                        {object.significance ? (
                          <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                            Cinematic note
                          </span>
                        ) : null}
                        <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                          {object.startTime.toFixed(2)}s - {object.endTime.toFixed(2)}s
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                          {object.keyframes.length} keyframes
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                      {typeof object.yoloConfidence === "number" ||
                      typeof object.confidence === "number"
                        ? `${confidence}%`
                        : "n/a"}
                    </span>
                  </div>

                  {object.description ? (
                    <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">
                      {object.description}
                    </p>
                  ) : null}

                  {object.significance ? (
                    <p className="mt-3 border-l-2 border-[var(--color-border-subtle)] pl-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                      {object.significance}
                    </p>
                  ) : null}

                  <div className="mt-4">
                    <div
                      className="h-2 overflow-hidden rounded-full"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-secondary) 88%, transparent)",
                      }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${confidence}%`,
                          background: `linear-gradient(90deg, color-mix(in oklch, ${color} 56%, transparent), ${color})`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                      Attributes
                    </p>
                    {attributes.length > 0 ? (
                      attributes.map(([key, value]) => (
                        <div
                          key={`${object.id}-${key}`}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="text-[var(--color-text-tertiary)]">{key}</span>
                          <span className="text-right text-[var(--color-text-secondary)]">
                            {value}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        No secondary attributes attached.
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
            No detected objects are attached to this shot yet.
          </p>
        )}
      </section>

      <section
        className="rounded-[var(--radius-xl)] border p-6"
        style={{
          backgroundColor:
            "color-mix(in oklch, var(--color-surface-secondary) 76%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Scene context
            </p>
            <h2
              className="mt-2 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Gemini scene enrichment
            </h2>
          </div>
        </div>

        {sceneContext ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Location", sceneContext.location],
              ["Time of day", sceneContext.timeOfDay],
              ["Period", sceneContext.period],
              ["Mood", sceneContext.mood],
              ["Interior / exterior", sceneContext.interiorExterior],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-[var(--radius-lg)] border p-4"
                style={{
                  backgroundColor:
                    "color-mix(in oklch, var(--color-surface-primary) 72%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--color-border-subtle) 90%, transparent)",
                }}
              >
                <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                  {label}
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                  {formatSceneValue(value)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-[var(--color-text-secondary)]">
            Scene-level enrichment has not been attached to this shot yet.
          </p>
        )}
      </section>
    </div>
  );
}
