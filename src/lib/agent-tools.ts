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
      "Search the MetroVision archive for shots matching criteria. Use this to find examples of specific composition patterns, framings, shot sizes, or directors.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search query" },
        framing: {
          type: "string",
          description: "Filter by framing slug (e.g. centered, rule_of_thirds_left, rule_of_thirds_right, split, frame_within_frame, negative_space_dominant, leading_lines, golden_ratio)",
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
      "Get detailed analysis of a specific film including scene breakdowns, shot size distributions, framing frequencies, and average shot length.",
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
      "Compare the visual styles of two or more directors by analyzing their shot distributions, framing preferences, and pacing across all films in the archive.",
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
      "Compare the cinematographic approaches of two or more films side-by-side, including shot size distributions, framing mix, and pacing.",
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
      "Find specific examples of a cinematographic technique (framing, depth, shot size, lighting cue, or angle) in the archive. Returns shots that demonstrate the technique.",
    parameters: {
      type: "object",
      properties: {
        technique: {
          type: "string",
          description: "The technique to search for (e.g. 'centered', 'rule_of_thirds_left', 'frame_within_frame', 'extreme_close', 'deep_staging', 'chiaroscuro')",
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
  {
    name: "render_pacing_heatmap",
    description:
      "Render a pacing heatmap visualization for a film showing shot duration patterns over time. Use when the user asks about pacing, rhythm, or tempo of a film.",
    parameters: {
      type: "object",
      properties: {
        filmTitle: { type: "string", description: "Film title to visualize" },
      },
      required: ["filmTitle"],
    },
  },
  {
    name: "render_director_radar",
    description:
      "Render a radar chart comparing composition distributions (e.g. framing mix) for one or more directors. Use when comparing directorial styles.",
    parameters: {
      type: "object",
      properties: {
        directors: {
          type: "array",
          items: { type: "string" },
          description: "Director names to compare on radar chart",
        },
      },
      required: ["directors"],
    },
  },
  {
    name: "render_shotlist",
    description:
      "Render a structured shotlist table for a film or scene. Use when the user wants to see or export a shotlist.",
    parameters: {
      type: "object",
      properties: {
        filmTitle: { type: "string", description: "Film title" },
        sceneNumber: { type: "number", description: "Optional scene number to filter" },
      },
      required: ["filmTitle"],
    },
  },
  {
    name: "render_comparison_table",
    description:
      "Render a side-by-side comparison table of two films' composition statistics. Use when comparing films.",
    parameters: {
      type: "object",
      properties: {
        filmTitles: {
          type: "array",
          items: { type: "string" },
          description: "Two film titles to compare",
        },
      },
      required: ["filmTitles"],
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
    case "render_pacing_heatmap":
      return handleRenderPacingHeatmap(args);
    case "render_director_radar":
      return handleRenderDirectorRadar(args);
    case "render_shotlist":
      return handleRenderShotlist(args);
    case "render_comparison_table":
      return handleRenderComparisonTable(args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSearchShots(args: Record<string, unknown>) {
  const filters: Record<string, string> = {};
  if (args.framing) filters.framing = String(args.framing);
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
        s.metadata.framing,
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
    framing: s.metadata.framing,
    depth: s.metadata.depth,
    blocking: s.metadata.blocking,
    shotSize: s.metadata.shotSize,
    angleVertical: s.metadata.angleVertical,
    duration: s.duration,
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
    framingFrequency: stats.framingFrequency,
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
      framingDistribution: Record<string, number>;
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
        framingDistribution: {},
        shotSizeDistribution: {},
        averageDuration: 0,
      };
      continue;
    }

    const filmSet = new Set(directorShots.map((s) => s.filmTitle));
    const framingCounts: Record<string, number> = {};
    const sizeCounts: Record<string, number> = {};
    let totalDuration = 0;

    for (const shot of directorShots) {
      framingCounts[shot.framing] =
        (framingCounts[shot.framing] ?? 0) + 1;
      sizeCounts[shot.shotSize] = (sizeCounts[shot.shotSize] ?? 0) + 1;
      totalDuration += shot.duration;
    }

    // Convert to percentages
    const total = directorShots.length;
    const framingDist: Record<string, number> = {};
    for (const [key, count] of Object.entries(framingCounts)) {
      framingDist[key] = Math.round((count / total) * 1000) / 10;
    }
    const sizeDist: Record<string, number> = {};
    for (const [key, count] of Object.entries(sizeCounts)) {
      sizeDist[key] = Math.round((count / total) * 1000) / 10;
    }

    results[director] = {
      filmCount: filmSet.size,
      shotCount: total,
      films: Array.from(filmSet),
      framingDistribution: framingDist,
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
      framingFrequency: stats.framingFrequency,
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

  // Try as framing first
  const byFraming = await getAllShots({ framing: technique });
  if (byFraming.length > 0) {
    return {
      technique,
      matchedBy: "framing",
      totalFound: byFraming.length,
      examples: byFraming.slice(0, limit).map((s) => ({
        shotId: s.id,
        filmTitle: s.film.title,
        director: s.film.director,
        framing: s.metadata.framing,
        shotSize: s.metadata.shotSize,
        duration: s.duration,
        depth: s.metadata.depth,
        blocking: s.metadata.blocking,
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
        framing: s.metadata.framing,
        shotSize: s.metadata.shotSize,
        duration: s.duration,
        depth: s.metadata.depth,
        blocking: s.metadata.blocking,
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
      s.metadata.framing,
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
      framing: s.metadata.framing,
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

  // Framing distribution
  const framingCounts: Record<string, number> = {};
  const sizeCounts: Record<string, number> = {};
  for (const shot of vizData.shots) {
    framingCounts[shot.framing] =
      (framingCounts[shot.framing] ?? 0) + 1;
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
    framingDistribution: framingCounts,
    shotSizeDistribution: sizeCounts,
  };
}

// ---------------------------------------------------------------------------
// Generative UI Visualization Handlers (M6)
// These return typed payloads that the chat client maps to D3 components.
// AC-08: No LLM-generated code — only structured data for pre-registered components.
// ---------------------------------------------------------------------------

async function handleRenderPacingHeatmap(args: Record<string, unknown>) {
  const title = String(args.filmTitle ?? "");
  const films = await getAllFilms();
  const match =
    films.find((f) => f.title.toLowerCase() === title.toLowerCase()) ??
    films.find((f) => f.title.toLowerCase().includes(title.toLowerCase()));

  if (!match) {
    return { error: `Film "${title}" not found.`, vizType: null };
  }

  const film = await getFilmById(match.id);
  if (!film) return { error: "Could not load film.", vizType: null };

  let shotSeq = 0;
  const shots = film.scenes.flatMap((s) =>
    s.shots.map((shot) => {
      const fg = shot.metadata.foregroundElements ?? [];
      const bg = shot.metadata.backgroundElements ?? [];
      const idx = shotSeq++;
      return {
        id: shot.id,
        filmId: film.id,
        filmTitle: film.title,
        director: film.director,
        sceneTitle: s.title,
        sceneNumber: s.sceneNumber,
        shotIndex: idx,
        framing: shot.metadata.framing,
        depth: shot.metadata.depth ?? "medium",
        blocking: shot.metadata.blocking ?? "single",
        shotSize: shot.metadata.shotSize ?? "medium",
        angleVertical: shot.metadata.angleVertical ?? "eye_level",
        angleHorizontal: shot.metadata.angleHorizontal ?? "frontal",
        symmetry: shot.metadata.symmetry ?? "asymmetric",
        dominantLines: shot.metadata.dominantLines ?? "none",
        lightingDirection: shot.metadata.lightingDirection ?? "natural",
        lightingQuality: shot.metadata.lightingQuality ?? "soft",
        colorTemperature: shot.metadata.colorTemperature ?? "neutral",
        durationCategory: shot.metadata.durationCategory ?? "standard",
        foregroundCount: fg.length,
        backgroundCount: bg.length,
        duration: shot.duration,
        objectCount: shot.objects?.length ?? 0,
        description: shot.semantic?.description ?? null,
        confidence: shot.metadata.confidence ?? null,
        reviewStatus: shot.metadata.reviewStatus ?? null,
        verificationCount: shot.trust?.verificationCount ?? 0,
      };
    }),
  );

  return {
    vizType: "pacing_heatmap",
    filmTitle: film.title,
    director: film.director,
    data: shots,
  };
}

async function handleRenderDirectorRadar(args: Record<string, unknown>) {
  const directors = (args.directors as string[]) ?? [];
  const vizData = await getVisualizationData();

  const directorData: Record<string, Record<string, number>> = {};

  for (const director of directors) {
    const shots = vizData.shots.filter(
      (s) => s.director.toLowerCase() === director.toLowerCase(),
    );
    if (shots.length === 0) continue;

    const counts: Record<string, number> = {};
    for (const shot of shots) {
      counts[shot.framing] = (counts[shot.framing] ?? 0) + 1;
    }
    // Normalize to percentages
    const total = shots.length;
    const pcts: Record<string, number> = {};
    for (const [k, v] of Object.entries(counts)) {
      pcts[k] = Math.round((v / total) * 1000) / 10;
    }
    directorData[director] = pcts;
  }

  return {
    vizType: "director_radar",
    directors: Object.keys(directorData),
    data: directorData,
  };
}

async function handleRenderShotlist(args: Record<string, unknown>) {
  const title = String(args.filmTitle ?? "");
  const sceneNum = args.sceneNumber ? Number(args.sceneNumber) : undefined;

  const films = await getAllFilms();
  const match =
    films.find((f) => f.title.toLowerCase() === title.toLowerCase()) ??
    films.find((f) => f.title.toLowerCase().includes(title.toLowerCase()));

  if (!match) return { error: `Film "${title}" not found.`, vizType: null };

  const film = await getFilmById(match.id);
  if (!film) return { error: "Could not load film.", vizType: null };

  const scenes = sceneNum
    ? film.scenes.filter((s) => s.sceneNumber === sceneNum)
    : film.scenes;

  const shotlist = scenes.flatMap((scene) =>
    scene.shots.map((shot, idx) => ({
      shotNumber: idx + 1,
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      framing: shot.metadata.framing,
      depth: shot.metadata.depth,
      blocking: shot.metadata.blocking,
      shotSize: shot.metadata.shotSize,
      duration: shot.duration,
      description: shot.semantic?.description ?? "",
      thumbnailUrl: shot.thumbnailUrl,
    })),
  );

  return {
    vizType: "shotlist",
    filmTitle: film.title,
    director: film.director,
    sceneFilter: sceneNum ?? null,
    data: shotlist,
  };
}

async function handleRenderComparisonTable(args: Record<string, unknown>) {
  const filmTitles = (args.filmTitles as string[]) ?? [];
  const allFilms = await getAllFilms();

  const comparisons: Array<{
    title: string;
    director: string;
    year: number | null;
    shotCount: number;
    sceneCount: number;
    averageShotLength: number;
    framingFrequency: Record<string, number>;
    shotSizeDistribution: Record<string, number>;
  }> = [];

  for (const title of filmTitles.slice(0, 4)) {
    const match =
      allFilms.find((f) => f.title.toLowerCase() === title.toLowerCase()) ??
      allFilms.find((f) => f.title.toLowerCase().includes(title.toLowerCase()));

    if (!match) continue;

    const stats = await getFilmCoverageStats(match.id);
    comparisons.push({
      title: match.title,
      director: match.director,
      year: match.year,
      shotCount: stats.shotCount,
      sceneCount: stats.sceneCount,
      averageShotLength: Math.round(stats.averageShotLength * 100) / 100,
      framingFrequency: stats.framingFrequency,
      shotSizeDistribution: stats.shotSizeDistribution,
    });
  }

  return {
    vizType: "comparison_table",
    data: comparisons,
  };
}
