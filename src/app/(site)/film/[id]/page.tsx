import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FilmHeader } from "@/components/films/film-header";
import { FilmCoverageStats } from "@/components/films/film-coverage-stats";
import { FilmTimeline } from "@/components/films/film-timeline";
import { SceneCard } from "@/components/films/scene-card";
import {
  getFilmById,
  getFilmCoverageStats,
  getFilmTrustSummary,
} from "@/db/queries";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const film = await getFilmById(id);
  if (!film) return { title: "Film Not Found" };
  return {
    title: `${film.title} — ${film.director}`,
    description: `Shot-level composition archive for ${film.title} (${film.year}) by ${film.director}. ${film.shotCount} shots across ${film.sceneCount} scenes.`,
  };
}

export default async function FilmDetailPage({ params }: Props) {
  const { id } = await params;
  const [film, stats, filmTrust] = await Promise.all([
    getFilmById(id),
    getFilmCoverageStats(id),
    getFilmTrustSummary(id),
  ]);

  if (!film) notFound();

  const allShots = film.scenes.flatMap((s) => s.shots);

  return (
    <div className="space-y-10 pb-16">
      {/* Back nav */}
      <div>
        <Link
          href="/browse"
          className="font-mono text-xs uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-accent)]"
        >
          &larr; Back to archive
        </Link>
      </div>

      {/* Film Header */}
      <FilmHeader film={film} trust={filmTrust} />

      {/* Full Film Timeline */}
      <section>
        <h2
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]"
        >
          Shot Timeline
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Every shot in sequence, color-coded by framing. Width proportional to duration.
        </p>
        <div className="mt-4">
          <FilmTimeline shots={allShots} scenes={film.scenes} />
        </div>
      </section>

      {/* Coverage Stats */}
      <section>
        <h2
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]"
        >
          Coverage Analysis
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Framing and shot-size distribution across {film.shotCount} shots.
        </p>
        <div className="mt-4">
          <FilmCoverageStats stats={stats} />
        </div>
      </section>

      {/* Scene List */}
      <section>
        <h2
          className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-accent)]"
        >
          Scenes ({film.sceneCount})
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Scene breakdown with shot coverage patterns.
        </p>
        <div className="mt-4 space-y-4">
          {film.scenes.map((scene) => (
            <SceneCard key={scene.id} scene={scene} />
          ))}
        </div>
      </section>
    </div>
  );
}
