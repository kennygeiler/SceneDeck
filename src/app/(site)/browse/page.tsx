import type { Metadata } from "next";

import { FilmBrowser } from "@/components/films/film-browser";
import { ShotBrowser } from "@/components/shots/shot-browser";
import {
  filterShotsCollection,
  getAllFilms,
  getAllShots,
  searchShots,
} from "@/db/queries";
import { getShotSizeDisplayName } from "@/lib/shot-display";
import type { ShotSizeSlug } from "@/lib/taxonomy";

export const metadata: Metadata = {
  title: "Browse",
  description: "Browse the MetroVision archive — films, scenes, and shots with camera movement analysis.",
};

type BrowsePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const resolvedSearchParams = await searchParams;
  const framing = getParamValue(resolvedSearchParams.framing)?.trim();
  const director = getParamValue(resolvedSearchParams.director)?.trim();
  const filmTitle = getParamValue(resolvedSearchParams.filmTitle)?.trim();
  const shotSize = getParamValue(resolvedSearchParams.shotSize)?.trim();
  const query = getParamValue(resolvedSearchParams.q)?.trim();

  const filters = {
    framing,
    director,
    filmTitle,
    shotSize,
  };

  const [films, allShots, initialShots] = await Promise.all([
    getAllFilms(),
    getAllShots(),
    query
      ? searchShots(query, {
          openAiApiKey: process.env.OPENAI_API_KEY,
        })
      : getAllShots(filters),
  ]);

  const shots = query ? filterShotsCollection(initialShots, filters) : initialShots;
  const availableFilmTitles = Array.from(
    new Set(allShots.map((shot) => shot.film.title)),
  ).sort((left, right) => left.localeCompare(right));
  const availableDirectors = Array.from(
    new Set(allShots.map((shot) => shot.film.director)),
  ).sort((left, right) => left.localeCompare(right));
  const availableShotSizes = Array.from(
    new Set(allShots.map((shot) => shot.metadata.shotSize)),
  ).sort((left, right) =>
    getShotSizeDisplayName(left as ShotSizeSlug).localeCompare(
      getShotSizeDisplayName(right as ShotSizeSlug),
    ),
  ) as ShotSizeSlug[];

  return (
    <FilmBrowser
      films={films}
      availableDirectors={availableDirectors}
      shotsView={
        <ShotBrowser
          shots={shots}
          totalShots={allShots.length}
          availableFilmTitles={availableFilmTitles}
          availableDirectors={availableDirectors}
          availableShotSizes={availableShotSizes}
        />
      }
    />
  );
}
