import Image from "next/image";
import Link from "next/link";

import { getAllShots } from "@/db/queries";
import { HomeHero } from "@/components/home/home-hero";
import { ShotCard } from "@/components/shots/shot-card";
import {
  formatShotDuration,
  getDirectionDisplayName,
  getMovementDisplayName,
  getShotSizeDisplayName,
} from "@/lib/shot-display";

const workflowSteps = [
  {
    step: "01",
    title: "Ingest",
    description:
      "Detect scenes, attach clips and thumbnails, and push normalized shot records into the archive.",
  },
  {
    step: "02",
    title: "Analyze",
    description:
      "Classify movement, direction, speed, angle, and shot scale using the shared SceneDeck taxonomy.",
  },
  {
    step: "03",
    title: "Explore",
    description:
      "Search the live database, inspect overlay telemetry, and route uncertain records into human verification.",
  },
] as const;

export default async function Home() {
  const featuredShots = (await getAllShots()).slice(0, 3);
  const [spotlightShot, ...secondaryShots] = featuredShots;

  return (
    <div className="flex flex-col gap-16 pb-16 sm:gap-20 lg:gap-24">
      <HomeHero />

      <section
        id="featured"
        className="scroll-mt-32 space-y-8"
        aria-labelledby="featured-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Featured archive
            </p>
            <h2
              id="featured-heading"
              className="mt-3 text-3xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-4xl lg:text-5xl"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Live shots from the database, staged like a product demo.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
              These records are rendered from the same data layer that powers the
              browse surface, detail overlay, and verification queue.
            </p>
          </div>

          <Link
            href="/browse"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--color-border-default)] px-5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            Open full archive
          </Link>
        </div>

        {spotlightShot ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
            <Link
              href={`/shot/${spotlightShot.id}`}
              className="group relative overflow-hidden rounded-[calc(var(--radius-xl)_+_6px)] border p-6 shadow-[var(--shadow-xl)] transition-transform duration-300 hover:-translate-y-1"
              style={{
                background:
                  "linear-gradient(145deg, color-mix(in oklch, var(--color-surface-secondary) 86%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 74%, transparent)",
              }}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 20% 24%, color-mix(in oklch, var(--color-overlay-arrow) 18%, transparent) 0%, transparent 24%), radial-gradient(circle at 78% 18%, color-mix(in oklch, var(--color-overlay-trajectory) 18%, transparent) 0%, transparent 20%), linear-gradient(135deg, color-mix(in oklch, var(--color-surface-tertiary) 84%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
                }}
              />
              {spotlightShot.thumbnailUrl ? (
                <Image
                  aria-hidden="true"
                  alt=""
                  src={spotlightShot.thumbnailUrl}
                  fill
                  priority={false}
                  sizes="(min-width: 1280px) 720px, 100vw"
                  className="absolute inset-0 object-cover opacity-60"
                />
              ) : null}
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklch, var(--color-surface-primary) 4%, transparent), color-mix(in oklch, var(--color-surface-primary) 76%, transparent) 72%, var(--color-surface-primary) 100%)",
                }}
              />

              <div className="relative flex h-full min-h-[26rem] flex-col justify-between gap-12">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-overlay-arrow) 26%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-overlay-arrow) 76%, transparent)",
                      }}
                    >
                      {getMovementDisplayName(spotlightShot.metadata.movementType)}
                    </span>
                    <span
                      className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-primary)]"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-overlay-trajectory) 22%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-overlay-trajectory) 72%, transparent)",
                      }}
                    >
                      {getShotSizeDisplayName(spotlightShot.metadata.shotSize)}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                    {formatShotDuration(spotlightShot.duration)}
                  </span>
                </div>

                <div className="relative max-w-2xl">
                  <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Spotlight record
                  </p>
                  <h3
                    className="mt-3 text-3xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-4xl"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {spotlightShot.film.title}
                  </h3>
                  <p className="mt-3 text-base leading-8 text-[var(--color-text-secondary)]">
                    {spotlightShot.semantic?.description ??
                      "A live database record with playback-ready telemetry, surfaced through the same overlay and browse system used across the product."}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <div
                      className="rounded-[var(--radius-lg)] border px-4 py-3"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-primary) 64%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                      }}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                        Director
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                        {spotlightShot.film.director}
                      </p>
                    </div>
                    <div
                      className="rounded-[var(--radius-lg)] border px-4 py-3"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-primary) 64%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                      }}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                        Direction
                      </p>
                      <p className="mt-2 text-sm text-[var(--color-text-primary)]">
                        {getDirectionDisplayName(spotlightShot.metadata.direction)}
                      </p>
                    </div>
                    <div
                      className="rounded-[var(--radius-lg)] border px-4 py-3"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-surface-primary) 64%, transparent)",
                        borderColor:
                          "color-mix(in oklch, var(--color-border-subtle) 88%, transparent)",
                      }}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                        Record ID
                      </p>
                      <p className="mt-2 font-mono text-sm text-[var(--color-text-primary)]">
                        {spotlightShot.id}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative flex items-center justify-between gap-4">
                  <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                    Open shot detail and inspect the overlay.
                  </p>
                  <span className="text-sm text-[var(--color-text-accent)] transition-transform duration-300 group-hover:translate-x-1">
                    View spotlight
                  </span>
                </div>
              </div>
            </Link>

            <div className="grid gap-5 content-start">
              {secondaryShots.map((shot) => (
                <ShotCard key={shot.id} shot={shot} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="rounded-[var(--radius-xl)] border p-8"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--color-surface-secondary) 74%, transparent), color-mix(in oklch, var(--color-surface-primary) 90%, transparent))",
              borderColor:
                "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
            }}
          >
            <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
              Archive awaiting records
            </p>
            <h3
              className="mt-3 text-2xl font-semibold text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              The Neon connection is live, but no shots are published yet.
            </h3>
            <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
              Run the pipeline and seed the archive to surface featured shots
              here automatically.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="how-it-works-heading" className="space-y-8">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Workflow
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-3 text-3xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            How it works
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
            The system moves from offline ingestion to searchable exploration
            without changing the taxonomy or the presentation layer.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {workflowSteps.map((item) => (
            <div
              key={item.step}
              className="rounded-[var(--radius-xl)] border p-6"
              style={{
                background:
                  "linear-gradient(160deg, color-mix(in oklch, var(--color-surface-secondary) 82%, transparent), color-mix(in oklch, var(--color-surface-primary) 96%, transparent))",
                borderColor:
                  "color-mix(in oklch, var(--color-border-default) 72%, transparent)",
              }}
            >
              <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]">
                {item.step}
              </p>
              <h3
                className="mt-4 text-2xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {item.title}
              </h3>
              <p className="mt-4 text-base leading-8 text-[var(--color-text-secondary)]">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
