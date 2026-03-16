import { getAllShots } from "@/db/queries";
import { HomeHero } from "@/components/home/home-hero";
import { ShotCard } from "@/components/shots/shot-card";

export default async function Home() {
  const featuredShots = (await getAllShots()).slice(0, 3);

  return (
    <div className="flex flex-col gap-8 pb-10 sm:gap-10 lg:gap-12">
      <HomeHero />

      <section className="space-y-6">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
            Featured shots
          </p>
          <h2
            className="mt-3 text-3xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Latest entries from the live archive
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
            These cards are now rendered directly from Neon via Drizzle queries,
            using the same shared shot type as browse and detail views.
          </p>
        </div>

        {featuredShots.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {featuredShots.map((shot) => (
              <ShotCard key={shot.id} shot={shot} />
            ))}
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
              No featured shots
            </p>
            <p className="mt-3 max-w-2xl text-base leading-8 text-[var(--color-text-secondary)]">
              The landing page is connected to the live database, but the shots
              table is currently empty.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
