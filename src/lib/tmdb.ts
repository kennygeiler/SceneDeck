const TMDB_API_BASE = "https://api.themoviedb.org/3";
const MAX_CAST_MEMBERS = 15;

type TmdbSearchResponse = {
  results?: Array<{
    id?: number;
    title?: string;
    release_date?: string;
  }>;
};

type TmdbMovieDetailsResponse = {
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string | null;
  runtime?: number | null;
  genres?: Array<{ id?: number; name?: string }>;
};

type TmdbCreditsResponse = {
  cast?: Array<{
    name?: string;
    character?: string;
  }>;
};

function resolveTmdbApiKey() {
  return process.env.TMDB_API_KEY?.trim() || "";
}

async function fetchTmdbJson<T>(
  pathname: string,
  searchParams: Record<string, string>,
): Promise<T | null> {
  const apiKey = resolveTmdbApiKey();

  if (!apiKey) {
    return null;
  }

  const url = new URL(`${TMDB_API_BASE}${pathname}`);
  url.searchParams.set("api_key", apiKey);

  for (const [key, value] of Object.entries(searchParams)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.warn(`TMDB request failed for ${pathname}: ${response.status}`);
    return null;
  }

  return (await response.json()) as T;
}

export async function searchTmdbMovieId(
  title: string,
  year: number | null,
): Promise<number | null> {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return null;
  }

  const payload = await fetchTmdbJson<TmdbSearchResponse>("/search/movie", {
    query: normalizedTitle,
    ...(Number.isInteger(year) ? { year: String(year) } : {}),
  });

  const exactMatch = payload?.results?.find((result) => {
    const releaseYear = result.release_date?.slice(0, 4);
    const titleMatches = result.title?.trim().toLowerCase() === normalizedTitle.toLowerCase();
    const yearMatches = !year || releaseYear === String(year);

    return Boolean(result.id) && titleMatches && yearMatches;
  });

  if (exactMatch?.id) {
    return exactMatch.id;
  }

  return payload?.results?.find((result) => typeof result.id === "number")?.id ?? null;
}

/** Typeahead row from `/search/movie` (no director until detail fetch). */
export type TmdbMovieSearchHit = {
  tmdbId: number;
  title: string;
  /** Usually `YYYY` from `release_date`; may be empty for unreleased. */
  year: string;
};

export async function searchTmdbMovies(
  query: string,
  limit = 12,
): Promise<TmdbMovieSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const payload = await fetchTmdbJson<TmdbSearchResponse>("/search/movie", {
    query: q,
  });

  const rows = payload?.results ?? [];
  return rows
    .filter((r): r is typeof r & { id: number; title: string } =>
      typeof r.id === "number" && Boolean(r.title?.trim()),
    )
    .slice(0, limit)
    .map((r) => ({
      tmdbId: r.id,
      title: r.title.trim(),
      year: r.release_date?.slice(0, 4) ?? "",
    }));
}

type TmdbMovieWithCreditsResponse = {
  title?: string;
  release_date?: string;
  credits?: {
    crew?: Array<{ name?: string; job?: string }>;
  };
};

/** Single TMDB round-trip for ingest form (title, year, primary director). */
export async function fetchTmdbMovieIngestFields(
  tmdbId: number,
): Promise<{ title: string; year: string; director: string } | null> {
  if (!Number.isInteger(tmdbId) || tmdbId < 1) return null;

  const payload = await fetchTmdbJson<TmdbMovieWithCreditsResponse>(`/movie/${tmdbId}`, {
    append_to_response: "credits",
  });

  if (!payload?.title?.trim()) return null;

  const directorNames =
    payload.credits?.crew
      ?.filter((c) => c.job === "Director")
      .map((c) => c.name?.trim())
      .filter((n): n is string => Boolean(n)) ?? [];

  return {
    title: payload.title.trim(),
    year: payload.release_date?.slice(0, 4) ?? "",
    director: directorNames.length ? directorNames.join(", ") : "",
  };
}

export type TmdbMovieDetails = {
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  runtime: number | null;
  genres: string[];
};

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export async function fetchTmdbMovieDetails(
  tmdbId: number,
): Promise<TmdbMovieDetails | null> {
  const payload = await fetchTmdbJson<TmdbMovieDetailsResponse>(
    `/movie/${tmdbId}`,
    {},
  );

  if (!payload) return null;

  return {
    posterUrl: payload.poster_path
      ? `${TMDB_IMAGE_BASE}/w500${payload.poster_path}`
      : null,
    backdropUrl: payload.backdrop_path
      ? `${TMDB_IMAGE_BASE}/w1280${payload.backdrop_path}`
      : null,
    overview: payload.overview ?? null,
    runtime: payload.runtime ?? null,
    genres:
      payload.genres
        ?.map((g) => g.name)
        .filter((name): name is string => Boolean(name)) ?? [],
  };
}

export async function fetchTmdbCast(tmdbId: number | null | undefined): Promise<string[]> {
  if (!Number.isInteger(tmdbId) || !tmdbId) {
    return [];
  }

  const payload = await fetchTmdbJson<TmdbCreditsResponse>(`/movie/${tmdbId}/credits`, {});

  return (
    payload?.cast
      ?.slice(0, MAX_CAST_MEMBERS)
      .flatMap((member) => {
        const name = member.name?.trim();
        const character = member.character?.trim();

        if (!name) {
          return [];
        }

        return [character ? `${name} as ${character}` : name];
      }) ?? []
  );
}
