import {
  getAllShots,
  getAllFilms,
  getFilmById,
  getFilmCoverageStats,
  getVisualizationData,
} from "@/db/queries";

// ---------------------------------------------------------------------------
// Tool Declarations (Gemini function-calling format)
// ---------------------------------------------------------------------------

export const TOOL_DECLARATIONS = [
  {
    name: "search_shots",
    description:
      "Search the MetroVision archive for shots matching criteria. Use this to find examples of specific techniques, movements, or shot types.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search query" },
        movementType: {
          type: "string",
          description: "Filter by movement type slug (e.g. static, pan, tilt, dolly, steadicam, handheld, crane, zoom, whip_pan, arc, follow, truck, drone)",
        },
        shotSize: {
          type: "string",
          description: "Filter by shot size slug (e.g. extreme_wide, wide, medium_wide, medium, medium_close, close, extreme_close, insert)",
        },
        director: {
          type: "string",
          description: "Filter by director name",
        },
        filmTitle: {
          type: "string",
          description: "Filter by film title",
        },
      },
    },
  },
  {
    name: "get_film_analysis",
    description:
      "Get detailed analysis of a specific film including scene breakdowns, shot size distributions, movement type frequencies, and average shot length.",
    parameters: {
      type: "object",
      properties: {
        filmTitle: {
          type: "string",
          description: "The title of the film to analyze",
        },
      },
      required: ["filmTitle"],
    },
  },
  {
    name: "compare_directors",
    description:
      "Compare the visual styles of two or more directors by analyzing their shot distributions, movement preferences, and pacing across all films in the archive.",
    parameters: {
      type: "object",
      properties: {
        directors: {
          type: "array",
          items: { type: "string" },
          description: "Array of director names to compare",
        },
      },
      required: ["directors"],
    },
  },
  {
    name: "compare_films",
    description:
      "Compare the cinematographic approaches of two or more films side-by-side, including shot size distributions, movement frequencies, and pacing.",
    parameters: {
      type: "object",
      properties: {
        filmTitles: {
          type: "array",
          items: { type: "string" },
          description: "Array of film titles to compare",
        },
      },
      required: ["filmTitles"],
    },
  },
  {
    name: "get_technique_examples",
    description:
      "Find specific examples of a cinematographic technique (movement type, shot size, angle) in the archive. Returns shots that demonstrate the technique.",
    parameters: {
      type: "object",
      properties: {
        technique: {
          type: "string",
          description: "The technique to search for (e.g. 'dolly_zoom', 'steadicam', 'extreme_close', 'whip_pan', 'crane')",
        },
        limit: {
          type: "number",
          description: "Maximum number of examples to return (default 10)",
        },
      },
      required: ["technique"],
    },
  },
  {
    name: "get_archive_summary",
    description:
      "Get a high-level summary of the entire MetroVision archive: total films, directors, shots, and aggregate statistics.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "search_shots":
      return handleSearchShots(args);
    case "get_film_analysis":
      return handleGetFilmAnalysis(args);
    case "compare_directors":
      return handleCompareDirectors(args);
    case "compare_films":
      return handleCompareFilms(args);
    case "get_technique_examples":
      return handleGetTechniqueExamples(args);
    case "get_archive_summary":
      return handleGetArchiveSummary();
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSearchShots(args: Record<string, unknown>) {
  const filters: Record<string, string> = {};
  if (args.movementType) filters.movementType = String(args.movementType);
  if (args.shotSize) filters.shotSize = String(args.shotSize);
  if (args.director) filters.director = String(args.director);
  if (args.filmTitle) filters.filmTitle = String(args.filmTitle);

  const shots = await getAllShots(
    Object.keys(filters).length > 0 ? filters : undefined,
  );

  // If there's a free-text query, do a basic relevance filter
  const query = args.query ? String(args.query).toLowerCase() : null;
  let filtered = shots;
  if (query) {
    filtered = shots.filter((s) => {
      const haystack = [
        s.film.title,
        s.film.director,
        s.metadata.movementType,
        s.metadata.shotSize,
        s.semantic?.description,
        s.semantic?.mood,
        ...(s.semantic?.subjects ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  return filtered.slice(0, 20).map((s) => ({
    shotId: s.id,
    filmTitle: s.film.title,
    director: s.film.director,
    movementType: s.metadata.movementType,
    shotSize: s.metadata.shotSize,
    duration: s.duration,
    direction: s.metadata.direction,
    speed: s.metadata.speed,
    angleVertical: s.metadata.angleVertical,
    isCompound: s.metadata.isCompound,
    description: s.semantic?.description ?? null,
    mood: s.semantic?.mood ?? null,
    subjects: s.semantic?.subjects ?? [],
    thumbnailUrl: s.thumbnailUrl,
  }));
}

async function handleGetFilmAnalysis(args: Record<string, unknown>) {
  const title = String(args.filmTitle ?? "");
  const films = await getAllFilms();
  const match = films.find(
    (f) => f.title.toLowerCase() === title.toLowerCase(),
  );

  if (!match) {
    // Try partial match
    const partial = films.find((f) =>
      f.title.toLowerCase().includes(title.toLowerCase()),
    );
    if (!partial) {
      return {
        error: `Film "${title}" not found in archive.`,
        availableFilms: films.map((f) => f.title),
      };
    }
    return buildFilmAnalysis(partial.id, partial.title);
  }

  return buildFilmAnalysis(match.id, match.title);
}

async function buildFilmAnalysis(filmId: string, filmTitle: string) {
  const [film, stats] = await Promise.all([
    getFilmById(filmId),
    getFilmCoverageStats(filmId),
  ]);

  if (!film) {
    return { error: `Could not load film data for "${filmTitle}".` };
  }

  return {
    title: film.title,
    director: film.director,
    year: film.year,
    overview: film.overview,
    runtime: film.runtime,
    genres: film.genres,
    sceneCount: stats.sceneCount,
    shotCount: stats.shotCount,
    totalDuration: stats.totalDuration,
    averageShotLength: Math.round(stats.averageShotLength * 100) / 100,
    shotSizeDistribution: stats.shotSizeDistribution,
    movementTypeFrequency: stats.movementTypeFrequency,
    scenes: film.scenes.map((scene) => ({
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      description: scene.description,
      shotCount: scene.shotCount,
      location: scene.location,
      timeOfDay: scene.timeOfDay,
    })),
  };
}

async function handleCompareDirectors(args: Record<string, unknown>) {
  const directors = (args.directors as string[]) ?? [];
  const vizData = await getVisualizationData();

  const results: Record<
    string,
    {
      filmCount: number;
      shotCount: number;
      films: string[];
      movementDistribution: Record<string, number>;
      shotSizeDistribution: Record<string, number>;
      averageDuration: number;
    }
  > = {};

  for (const director of directors) {
    const directorShots = vizData.shots.filter(
      (s) => s.director.toLowerCase() === director.toLowerCase(),
    );

    if (directorShots.length === 0) {
      results[director] = {
        filmCount: 0,
        shotCount: 0,
        films: [],
        movementDistribution: {},
        shotSizeDistribution: {},
        averageDuration: 0,
      };
      continue;
    }

    const filmSet = new Set(directorShots.map((s) => s.filmTitle));
    const movementCounts: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};
    let totalDuration = 0;

    for (const shot of directorShots) {
      movementCounts[shot.movementType] =
        (movementCounts[shot.movementType] ?? 0) + 1;
      sizeCounts[shot.shotSize] = (sizeCounts[shot.shotSize] ?? 0) + 1;
      totalDuration += shot.duration;
    }

    // Convert to percentages
    const total = directorShots.length;
    const movementDist: Record<string, number> = {};
    for (const [key, count] of Object.entries(movementCounts)) {
      movementDist[key] = Math.round((count / total) * 1000) / 10;
    }
    const sizeDist: Record<string, number> = {};
    for (const [key, count] of Object.entries(sizeCounts)) {
      sizeDist[key] = Math.round((count / total) * 1000) / 10;
    }

    results[director] = {
      filmCount: filmSet.size,
      shotCount: total,
      films: Array.from(filmSet),
      movementDistribution: movementDist,
      shotSizeDistribution: sizeDist,
      averageDuration: Math.round((totalDuration / total) * 100) / 100,
    };
  }

  const availableDirectors = vizData.directors;
  const notFound = directors.filter(
    (d) =>
      !availableDirectors.some(
        (ad) => ad.toLowerCase() === d.toLowerCase(),
      ),
  );

  return {
    comparison: results,
    ...(notFound.length > 0 && {
      notFoundInArchive: notFound,
      availableDirectors,
    }),
  };
}

async function handleCompareFilms(args: Record<string, unknown>) {
  const filmTitles = (args.filmTitles as string[]) ?? [];
  const allFilms = await getAllFilms();

  const results: Record<string, unknown> = {};

  for (const title of filmTitles) {
    const match =
      allFilms.find(
        (f) => f.title.toLowerCase() === title.toLowerCase(),
      ) ??
      allFilms.find((f) =>
        f.title.toLowerCase().includes(title.toLowerCase()),
      );

    if (!match) {
      results[title] = { error: `Film "${title}" not found in archive.` };
      continue;
    }

    const stats = await getFilmCoverageStats(match.id);
    results[match.title] = {
      director: match.director,
      year: match.year,
      shotCount: stats.shotCount,
      sceneCount: stats.sceneCount,
      totalDuration: stats.totalDuration,
      averageShotLength: Math.round(stats.averageShotLength * 100) / 100,
      shotSizeDistribution: stats.shotSizeDistribution,
      movementTypeFrequency: stats.movementTypeFrequency,
    };
  }

  return {
    comparison: results,
    availableFilms: allFilms.map((f) => f.title),
  };
}

async function handleGetTechniqueExamples(args: Record<string, unknown>) {
  const technique = String(args.technique ?? "");
  const limit = Math.min(Number(args.limit ?? 10), 20);

  // Try as movement type first
  const byMovement = await getAllShots({ movementType: technique });
  if (byMovement.length > 0) {
    return {
      technique,
      matchedBy: "movementType",
      totalFound: byMovement.length,
      examples: byMovement.slice(0, limit).map((s) => ({
        shotId: s.id,
        filmTitle: s.film.title,
        director: s.film.director,
        movementType: s.metadata.movementType,
        shotSize: s.metadata.shotSize,
        duration: s.duration,
        direction: s.metadata.direction,
        speed: s.metadata.speed,
        description: s.semantic?.description ?? null,
        mood: s.semantic?.mood ?? null,
        thumbnailUrl: s.thumbnailUrl,
      })),
    };
  }

  // Try as shot size
  const bySize = await getAllShots({ shotSize: technique });
  if (bySize.length > 0) {
    return {
      technique,
      matchedBy: "shotSize",
      totalFound: bySize.length,
      examples: bySize.slice(0, limit).map((s) => ({
        shotId: s.id,
        filmTitle: s.film.title,
        director: s.film.director,
        movementType: s.metadata.movementType,
        shotSize: s.metadata.shotSize,
        duration: s.duration,
        direction: s.metadata.direction,
        speed: s.metadata.speed,
        description: s.semantic?.description ?? null,
        mood: s.semantic?.mood ?? null,
        thumbnailUrl: s.thumbnailUrl,
      })),
    };
  }

  // Fallback: search all shots for the technique string in descriptions
  const allShots = await getAllShots();
  const techLower = technique.toLowerCase().replace(/_/g, " ");
  const matched = allShots.filter((s) => {
    const text = [
      s.metadata.movementType,
      s.metadata.shotSize,
      s.semantic?.description,
      s.semantic?.techniqueNotes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return text.includes(techLower);
  });

  return {
    technique,
    matchedBy: "textSearch",
    totalFound: matched.length,
    examples: matched.slice(0, limit).map((s) => ({
      shotId: s.id,
      filmTitle: s.film.title,
      director: s.film.director,
      movementType: s.metadata.movementType,
      shotSize: s.metadata.shotSize,
      duration: s.duration,
      description: s.semantic?.description ?? null,
      thumbnailUrl: s.thumbnailUrl,
    })),
  };
}

async function handleGetArchiveSummary() {
  const [films, vizData] = await Promise.all([
    getAllFilms(),
    getVisualizationData(),
  ]);

  const totalShots = vizData.shots.length;
  const totalDuration = vizData.shots.reduce((sum, s) => sum + s.duration, 0);

  // Movement type distribution
  const movementCounts: Record<string, number> = {};
  const sizeCounts: Record<string, number> = {};
  for (const shot of vizData.shots) {
    movementCounts[shot.movementType] =
      (movementCounts[shot.movementType] ?? 0) + 1;
    sizeCounts[shot.shotSize] = (sizeCounts[shot.shotSize] ?? 0) + 1;
  }

  return {
    totalFilms: films.length,
    totalDirectors: vizData.directors.length,
    totalShots,
    totalDuration: Math.round(totalDuration * 100) / 100,
    averageShotLength:
      totalShots > 0
        ? Math.round((totalDuration / totalShots) * 100) / 100
        : 0,
    directors: vizData.directors,
    films: films.map((f) => ({
      title: f.title,
      director: f.director,
      year: f.year,
      shotCount: f.shotCount,
      sceneCount: f.sceneCount,
    })),
    movementTypeDistribution: movementCounts,
    shotSizeDistribution: sizeCounts,
  };
}
