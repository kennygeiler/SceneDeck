export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { searchArchiveFilms } from "@/lib/archive-org";
import { searchTmdbMovieId, fetchTmdbMovieDetails } from "@/lib/tmdb";

type EnrichedFilm = {
  title: string;
  director: string;
  year: number | null;
  sourceUrl: string;
  fileSize: number | null;
  posterUrl: string | null;
  genres: string[];
  tmdbId: number | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const count = parseInt(searchParams.get("count") ?? "50", 10) || 50;

    const archiveFilms = await searchArchiveFilms(count);

    // Enrich each film with TMDB data (best-effort, don't fail batch on TMDB errors)
    const enriched: EnrichedFilm[] = await Promise.all(
      archiveFilms.map(async (film) => {
        let posterUrl: string | null = null;
        let genres: string[] = [];
        let tmdbId: number | null = null;

        try {
          tmdbId = await searchTmdbMovieId(film.title, film.year);
          if (tmdbId) {
            const details = await fetchTmdbMovieDetails(tmdbId);
            if (details) {
              posterUrl = details.posterUrl;
              genres = details.genres;
            }
          }
        } catch {
          // TMDB enrichment is best-effort — continue without it
        }

        return {
          title: film.title,
          director: film.director,
          year: film.year,
          sourceUrl: film.sourceUrl,
          fileSize: film.fileSize,
          posterUrl,
          genres,
          tmdbId,
        };
      }),
    );

    return NextResponse.json(enriched);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to source films";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
