import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db, schema } from "@/db";

/** Convert private blob URLs to proxied URLs that browsers can access. */
function proxyBlobUrl(url: string | null): string | null {
  if (!url) return null;
  // S3 proxy URLs are already in the right format
  if (url.startsWith("/api/s3")) return url;
  if (!url.includes("private.blob.vercel-storage.com")) return url;
  return `/api/blob/${encodeURIComponent(url)}`;
}
import {
  generateTextEmbedding,
  toVectorLiteral,
} from "@/db/embeddings";
import type {
  ExportShotRecord,
  FilmCard,
  FilmCoverageStats,
  FilmWithDetails,
  SceneWithShots,
  ShotReviewQueueItem,
  ShotWithDetails,
  VerificationCorrectionsMap,
  VerificationFieldRatingsMap,
  VerificationRecord,
  VerificationStats,
  VisualizationData,
  VizShot,
} from "@/lib/types";
import type {
  BlockingTypeSlug,
  ColorTemperatureSlug,
  DepthTypeSlug,
  DominantLineSlug,
  DurationCategorySlug,
  FramingSlug,
  HorizontalAngleSlug,
  LightingDirectionSlug,
  LightingQualitySlug,
  ShotSizeSlug,
  SymmetryTypeSlug,
  VerticalAngleSlug,
} from "@/lib/taxonomy";

const REVIEW_PASSING_RATING = 4;

export type ShotQueryFilters = {
  framing?: string;
  director?: string;
  filmTitle?: string;
  shotSize?: string;
};

const shotSelection = {
  shotId: schema.shots.id,
  shotSceneId: schema.shots.sceneId,
  shotSourceFile: schema.shots.sourceFile,
  shotStartTc: schema.shots.startTc,
  shotEndTc: schema.shots.endTc,
  shotDuration: schema.shots.duration,
  shotVideoUrl: schema.shots.videoUrl,
  shotThumbnailUrl: schema.shots.thumbnailUrl,
  shotCreatedAt: schema.shots.createdAt,
  filmId: schema.films.id,
  filmTitle: schema.films.title,
  filmDirector: schema.films.director,
  filmYear: schema.films.year,
  filmTmdbId: schema.films.tmdbId,
  filmCreatedAt: schema.films.createdAt,
  metadataId: schema.shotMetadata.id,
  metadataShotId: schema.shotMetadata.shotId,
  metadataFraming: schema.shotMetadata.framing,
  metadataDepth: schema.shotMetadata.depth,
  metadataBlocking: schema.shotMetadata.blocking,
  metadataSymmetry: schema.shotMetadata.symmetry,
  metadataDominantLines: schema.shotMetadata.dominantLines,
  metadataLightingDirection: schema.shotMetadata.lightingDirection,
  metadataLightingQuality: schema.shotMetadata.lightingQuality,
  metadataColorTemperature: schema.shotMetadata.colorTemperature,
  metadataForegroundElements: schema.shotMetadata.foregroundElements,
  metadataBackgroundElements: schema.shotMetadata.backgroundElements,
  metadataShotSize: schema.shotMetadata.shotSize,
  metadataAngleVertical: schema.shotMetadata.angleVertical,
  metadataAngleHorizontal: schema.shotMetadata.angleHorizontal,
  metadataDurationCat: schema.shotMetadata.durationCat,
  metadataClassificationSource: schema.shotMetadata.classificationSource,
  semanticId: schema.shotSemantic.id,
  semanticShotId: schema.shotSemantic.shotId,
  semanticDescription: schema.shotSemantic.description,
  semanticSubjects: schema.shotSemantic.subjects,
  semanticMood: schema.shotSemantic.mood,
  semanticLighting: schema.shotSemantic.lighting,
  semanticTechniqueNotes: schema.shotSemantic.techniqueNotes,
};

type ShotRow = Awaited<
  ReturnType<ReturnType<typeof selectJoinedShots>["execute"]>
>[number];

export type ExportQueryFilters = {
  framing?: string;
  director?: string;
  filmTitle?: string;
  shotSize?: string;
};

function selectJoinedShots() {
  return db
    .select(shotSelection)
    .from(schema.shots)
    .innerJoin(schema.films, eq(schema.shots.filmId, schema.films.id))
    .leftJoin(schema.shotMetadata, eq(schema.shots.id, schema.shotMetadata.shotId))
    .leftJoin(schema.shotSemantic, eq(schema.shots.id, schema.shotSemantic.shotId));
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

function toRoundedAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function mapShotRow(row: ShotRow): ShotWithDetails {
  return {
    id: row.shotId,
    sceneId: row.shotSceneId ?? null,
    film: {
      id: row.filmId,
      title: row.filmTitle,
      director: row.filmDirector,
      year: row.filmYear ?? null,
      tmdbId: row.filmTmdbId ?? null,
      createdAt: toIsoString(row.filmCreatedAt ?? null),
    },
    metadata: {
      id: row.metadataId ?? null,
      shotId: row.metadataShotId ?? null,
      framing: (row.metadataFraming ?? "centered") as FramingSlug,
      depth: (row.metadataDepth ?? "medium") as DepthTypeSlug,
      blocking: (row.metadataBlocking ?? "single") as BlockingTypeSlug,
      symmetry: (row.metadataSymmetry ?? "asymmetric") as SymmetryTypeSlug,
      dominantLines: (row.metadataDominantLines ?? "none") as DominantLineSlug,
      lightingDirection: (row.metadataLightingDirection ?? "natural") as LightingDirectionSlug,
      lightingQuality: (row.metadataLightingQuality ?? "soft") as LightingQualitySlug,
      colorTemperature: (row.metadataColorTemperature ?? "neutral") as ColorTemperatureSlug,
      foregroundElements: row.metadataForegroundElements ?? [],
      backgroundElements: row.metadataBackgroundElements ?? [],
      shotSize: (row.metadataShotSize ?? "medium") as ShotSizeSlug,
      angleVertical: (row.metadataAngleVertical ?? "eye_level") as VerticalAngleSlug,
      angleHorizontal: (row.metadataAngleHorizontal ?? "frontal") as HorizontalAngleSlug,
      durationCategory: (row.metadataDurationCat ?? "standard") as DurationCategorySlug,
      classificationSource: row.metadataClassificationSource ?? null,
    },
    semantic: row.semanticId
      ? {
          id: row.semanticId,
          shotId: row.semanticShotId ?? null,
          description: row.semanticDescription ?? null,
          subjects: row.semanticSubjects ?? [],
          mood: row.semanticMood ?? null,
          lighting: row.semanticLighting ?? null,
          techniqueNotes: row.semanticTechniqueNotes ?? null,
        }
      : null,
    duration: row.shotDuration ?? 0,
    sourceFile: row.shotSourceFile ?? null,
    startTc: row.shotStartTc ?? null,
    endTc: row.shotEndTc ?? null,
    videoUrl: proxyBlobUrl(row.shotVideoUrl ?? null),
    thumbnailUrl: proxyBlobUrl(row.shotThumbnailUrl ?? null),
    createdAt: toIsoString(row.shotCreatedAt ?? null),
    objects: [],
  };
}

function mapShotObjectRow(row: typeof schema.shotObjects.$inferSelect) {
  return {
    id: row.id,
    trackId: row.trackId,
    label: row.label,
    category: row.category ?? null,
    confidence: row.confidence ?? null,
    yoloClass: row.yoloClass ?? null,
    yoloConfidence: row.yoloConfidence ?? null,
    cinematicLabel: row.cinematicLabel ?? null,
    description: row.description ?? null,
    significance: row.significance ?? null,
    keyframes: row.keyframes ?? [],
    startTime: row.startTime ?? 0,
    endTime: row.endTime ?? 0,
    attributes: (row.attributes as Record<string, string> | null) ?? null,
    sceneContext: row.sceneContext ?? null,
  };
}

async function getObjectsGroupedByShotIds(shotIds: string[]) {
  if (shotIds.length === 0) {
    return new Map<string, ShotWithDetails["objects"]>();
  }

  const rows = await db
    .select()
    .from(schema.shotObjects)
    .where(inArray(schema.shotObjects.shotId, shotIds))
    .orderBy(schema.shotObjects.startTime, desc(schema.shotObjects.confidence));

  const objectsByShotId = new Map<string, ShotWithDetails["objects"]>();

  for (const row of rows) {
    const objects = objectsByShotId.get(row.shotId) ?? [];
    objects.push(mapShotObjectRow(row));
    objectsByShotId.set(row.shotId, objects);
  }

  return objectsByShotId;
}

async function attachObjectsToShots(shots: ShotWithDetails[]) {
  const objectsByShotId = await getObjectsGroupedByShotIds(shots.map((shot) => shot.id));

  return shots.map((shot) => ({
    ...shot,
    objects: objectsByShotId.get(shot.id) ?? [],
  }));
}

function mapExportShotRow(row: ShotRow): ExportShotRecord {
  return {
    shotId: row.shotId,
    filmTitle: row.filmTitle,
    director: row.filmDirector,
    year: row.filmYear ?? null,
    sourceFile: row.shotSourceFile ?? null,
    startTc: row.shotStartTc ?? null,
    endTc: row.shotEndTc ?? null,
    duration: row.shotDuration ?? 0,
    videoUrl: proxyBlobUrl(row.shotVideoUrl ?? null),
    thumbnailUrl: proxyBlobUrl(row.shotThumbnailUrl ?? null),
    framing: (row.metadataFraming ?? "centered") as FramingSlug,
    depth: (row.metadataDepth ?? "medium") as DepthTypeSlug,
    blocking: (row.metadataBlocking ?? "single") as BlockingTypeSlug,
    symmetry: (row.metadataSymmetry ?? "asymmetric") as SymmetryTypeSlug,
    dominantLines: (row.metadataDominantLines ?? "none") as DominantLineSlug,
    lightingDirection: (row.metadataLightingDirection ?? "natural") as LightingDirectionSlug,
    lightingQuality: (row.metadataLightingQuality ?? "soft") as LightingQualitySlug,
    colorTemperature: (row.metadataColorTemperature ?? "neutral") as ColorTemperatureSlug,
    shotSize: (row.metadataShotSize ?? "medium") as ShotSizeSlug,
    angleVertical: (row.metadataAngleVertical ?? "eye_level") as VerticalAngleSlug,
    angleHorizontal: (row.metadataAngleHorizontal ?? "frontal") as HorizontalAngleSlug,
    durationCategory: (row.metadataDurationCat ?? "standard") as DurationCategorySlug,
    classificationSource: row.metadataClassificationSource ?? null,
    description: row.semanticDescription ?? null,
    subjects: (row.semanticSubjects ?? []).join(" | "),
    mood: row.semanticMood ?? null,
    lighting: row.semanticLighting ?? null,
    techniqueNotes: row.semanticTechniqueNotes ?? null,
    createdAt: toIsoString(row.shotCreatedAt ?? null),
  };
}

function mapVerificationRecord(
  row: typeof schema.verifications.$inferSelect,
): VerificationRecord {
  return {
    id: row.id,
    shotId: row.shotId,
    overallRating: row.overallRating ?? null,
    fieldRatings: (row.fieldRatings as VerificationFieldRatingsMap | null) ?? null,
    corrections: (row.corrections as VerificationCorrectionsMap | null) ?? null,
    notes: row.notes ?? null,
    verifiedAt: toIsoString(row.verifiedAt ?? null),
  };
}

function buildVerificationSummary(
  verifications: Array<{
    shotId: string;
    overallRating: number | null;
    verifiedAt: Date | null;
  }>,
) {
  const summaryByShot = new Map<
    string,
    {
      verificationCount: number;
      ratings: number[];
      latestVerifiedAt: Date | null;
    }
  >();

  for (const verification of verifications) {
    const summary = summaryByShot.get(verification.shotId) ?? {
      verificationCount: 0,
      ratings: [],
      latestVerifiedAt: null,
    };

    summary.verificationCount += 1;

    if (typeof verification.overallRating === "number") {
      summary.ratings.push(verification.overallRating);
    }

    if (
      verification.verifiedAt &&
      (!summary.latestVerifiedAt || verification.verifiedAt > summary.latestVerifiedAt)
    ) {
      summary.latestVerifiedAt = verification.verifiedAt;
    }

    summaryByShot.set(verification.shotId, summary);
  }

  return summaryByShot;
}

function getRelevanceScore(shot: ShotWithDetails, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  const title = shot.film.title.toLowerCase();
  const director = shot.film.director.toLowerCase();
  const framing = shot.metadata.framing.toLowerCase();
  const description = shot.semantic?.description?.toLowerCase() ?? "";

  let score = 0;

  if (title === normalizedQuery) {
    score += 10;
  } else if (title.includes(normalizedQuery)) {
    score += 5;
  }

  if (director === normalizedQuery) {
    score += 8;
  } else if (director.includes(normalizedQuery)) {
    score += 4;
  }

  if (framing === normalizedQuery) {
    score += 6;
  } else if (framing.includes(normalizedQuery)) {
    score += 3;
  }

  if (description.includes(normalizedQuery)) {
    score += 2;
  }

  return score;
}

export function filterShotsCollection(
  shots: ShotWithDetails[],
  filters?: ShotQueryFilters,
) {
  if (!filters) {
    return shots;
  }

  return shots.filter((shot) => {
    if (
      filters.framing &&
      shot.metadata.framing !== filters.framing
    ) {
      return false;
    }

    if (filters.director && shot.film.director !== filters.director) {
      return false;
    }

    if (filters.filmTitle && shot.film.title !== filters.filmTitle) {
      return false;
    }

    if (filters.shotSize && shot.metadata.shotSize !== filters.shotSize) {
      return false;
    }

    return true;
  });
}

export async function getAllShots(filters?: ShotQueryFilters) {
  const conditions: SQL[] = [];

  if (filters?.framing) {
    conditions.push(
      eq(
        schema.shotMetadata.framing,
        filters.framing as FramingSlug,
      ),
    );
  }

  if (filters?.director) {
    conditions.push(eq(schema.films.director, filters.director));
  }

  if (filters?.filmTitle) {
    conditions.push(eq(schema.films.title, filters.filmTitle));
  }

  if (filters?.shotSize) {
    conditions.push(
      eq(schema.shotMetadata.shotSize, filters.shotSize as ShotSizeSlug),
    );
  }

  const rows = await selectJoinedShots()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.shots.createdAt));

  return attachObjectsToShots(rows.map(mapShotRow));
}

export async function getShotById(id: string) {
  const [row] = await selectJoinedShots()
    .where(eq(schema.shots.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const [shot] = await attachObjectsToShots([mapShotRow(row)]);
  return shot ?? null;
}

export async function getObjectsForShot(shotId: string) {
  const rows = await db
    .select()
    .from(schema.shotObjects)
    .where(eq(schema.shotObjects.shotId, shotId))
    .orderBy(schema.shotObjects.startTime, desc(schema.shotObjects.confidence));

  return rows.map(mapShotObjectRow);
}

export async function getShotsForExport(filters?: {
  framing?: string;
  director?: string;
  filmTitle?: string;
  shotSize?: string;
}) {
  const conditions: SQL[] = [];

  if (filters?.framing) {
    conditions.push(
      eq(
        schema.shotMetadata.framing,
        filters.framing as FramingSlug,
      ),
    );
  }

  if (filters?.director) {
    conditions.push(eq(schema.films.director, filters.director));
  }

  if (filters?.filmTitle) {
    conditions.push(ilike(schema.films.title, `%${filters.filmTitle}%`));
  }

  if (filters?.shotSize) {
    conditions.push(
      eq(schema.shotMetadata.shotSize, filters.shotSize as ShotSizeSlug),
    );
  }

  const rows = await selectJoinedShots()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      schema.films.title,
      schema.films.director,
      desc(schema.shots.createdAt),
    );

  return rows.map(mapExportShotRow);
}

async function searchShotsWithIlike(query: string): Promise<ShotWithDetails[]> {
  const searchTerm = `%${query}%`;
  const rows = await selectJoinedShots()
    .where(
      or(
        ilike(schema.films.title, searchTerm),
        ilike(schema.films.director, searchTerm),
        ilike(schema.shotMetadata.framing, searchTerm),
        ilike(schema.shotSemantic.description, searchTerm),
      ),
    )
    .orderBy(desc(schema.shots.createdAt));

  return rows
    .map((row) => {
      const shot = mapShotRow(row);

      return {
        ...shot,
        relevance: getRelevanceScore(shot, query),
      };
    })
    .sort((left, right) => {
      if ((right.relevance ?? 0) !== (left.relevance ?? 0)) {
        return (right.relevance ?? 0) - (left.relevance ?? 0);
      }

      return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
    });
}

type SearchShotsOptions = {
  openAiApiKey?: string;
};

type RankedEmbeddingRow = {
  shotId: string;
  distance: number;
};

async function searchShotsWithEmbeddings(
  query: string,
  options?: SearchShotsOptions,
): Promise<ShotWithDetails[] | null> {
  const [existingEmbedding] = await db
    .select({ shotId: schema.shotEmbeddings.shotId })
    .from(schema.shotEmbeddings)
    .limit(1);

  if (!existingEmbedding) {
    return null;
  }

  const queryEmbedding = await generateTextEmbedding(query, options?.openAiApiKey);
  const queryVector = toVectorLiteral(queryEmbedding);
  const embeddingResult = await db.execute(
    sql<RankedEmbeddingRow>`
      SELECT shot_id AS "shotId", embedding <=> ${queryVector}::vector AS "distance"
      FROM ${schema.shotEmbeddings}
      ORDER BY embedding <=> ${queryVector}::vector
      LIMIT 20
    `,
  );
  const rankedEmbeddings = embeddingResult.rows as RankedEmbeddingRow[];
  const shotIds = rankedEmbeddings.map((row) => row.shotId);

  if (shotIds.length === 0) {
    return [];
  }

  const rows = await selectJoinedShots().where(inArray(schema.shots.id, shotIds));
  const shotsById = new Map(rows.map((row) => [row.shotId, mapShotRow(row)]));
  const rankedShots: ShotWithDetails[] = [];

  for (const row of rankedEmbeddings) {
    const shot = shotsById.get(row.shotId);

    if (!shot) {
      continue;
    }

    rankedShots.push({
      ...shot,
      relevance: 1 - row.distance,
    });
  }

  return attachObjectsToShots(rankedShots);
}

export async function searchShots(query: string, options?: SearchShotsOptions) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  try {
    const semanticResults = await searchShotsWithEmbeddings(
      normalizedQuery,
      options,
    );

    if (semanticResults) {
      return semanticResults;
    }
  } catch (error) {
    console.error("Semantic search failed. Falling back to ILIKE.", error);
  }

  return searchShotsWithIlike(normalizedQuery);
}

export async function getShotsForReview(): Promise<ShotReviewQueueItem[]> {
  const [shots, verificationRows] = await Promise.all([
    getAllShots(),
    db
      .select({
        shotId: schema.verifications.shotId,
        overallRating: schema.verifications.overallRating,
        verifiedAt: schema.verifications.verifiedAt,
      })
      .from(schema.verifications),
  ]);

  const verificationSummary = buildVerificationSummary(verificationRows);

  return shots
    .map((shot) => {
      const summary = verificationSummary.get(shot.id);
      const averageOverallRating = toRoundedAverage(summary?.ratings ?? []);

      return {
        ...shot,
        verificationCount: summary?.verificationCount ?? 0,
        averageOverallRating,
        latestVerifiedAt: toIsoString(summary?.latestVerifiedAt ?? null),
      };
    })
    .filter(
      (shot) =>
        shot.verificationCount === 0 ||
        (shot.averageOverallRating ?? 0) < REVIEW_PASSING_RATING,
    )
    .sort((left, right) => {
      if ((left.verificationCount === 0) !== (right.verificationCount === 0)) {
        return left.verificationCount === 0 ? -1 : 1;
      }

      const leftRating = left.averageOverallRating ?? Number.POSITIVE_INFINITY;
      const rightRating = right.averageOverallRating ?? Number.POSITIVE_INFINITY;

      if (leftRating !== rightRating) {
        return leftRating - rightRating;
      }

      return left.film.title.localeCompare(right.film.title);
    });
}

export async function getVerificationsForShot(
  shotId: string,
): Promise<VerificationRecord[]> {
  const rows = await db
    .select()
    .from(schema.verifications)
    .where(eq(schema.verifications.shotId, shotId))
    .orderBy(desc(schema.verifications.verifiedAt));

  return rows.map(mapVerificationRecord);
}

export async function submitVerification(data: {
  shotId: string;
  overallRating: number;
  fieldRatings: Record<string, number>;
  corrections?: Record<string, string>;
  notes?: string;
}): Promise<VerificationRecord> {
  const fieldRatings = Object.fromEntries(
    Object.entries(data.fieldRatings)
      .filter(([, value]) => typeof value === "number")
      .map(([field, value]) => [field, value]),
  ) as VerificationFieldRatingsMap;

  const corrections = Object.fromEntries(
    Object.entries(data.corrections ?? {}).filter(([, value]) => Boolean(value)),
  ) as VerificationCorrectionsMap;

  const [row] = await db
    .insert(schema.verifications)
    .values({
      shotId: data.shotId,
      overallRating: data.overallRating,
      fieldRatings,
      corrections: Object.keys(corrections).length > 0 ? corrections : null,
      notes: data.notes?.trim() ? data.notes.trim() : null,
    })
    .returning();

  return mapVerificationRecord(row);
}

export async function getVerificationStats(): Promise<VerificationStats> {
  const [shots, verificationRows] = await Promise.all([
    db.select({ id: schema.shots.id }).from(schema.shots),
    db
      .select({
        shotId: schema.verifications.shotId,
        overallRating: schema.verifications.overallRating,
        verifiedAt: schema.verifications.verifiedAt,
      })
      .from(schema.verifications),
  ]);

  const verificationSummary = buildVerificationSummary(verificationRows);
  const ratings = verificationRows
    .map((verification) => verification.overallRating)
    .filter((rating): rating is number => typeof rating === "number");

  return {
    totalShots: shots.length,
    verifiedShots: verificationSummary.size,
    unverifiedShots: shots.length - verificationSummary.size,
    totalVerifications: verificationRows.length,
    averageOverallRating: toRoundedAverage(ratings),
    reviewQueueCount: shots.filter((shot) => {
      const summary = verificationSummary.get(shot.id);
      const averageOverallRating = toRoundedAverage(summary?.ratings ?? []);

      return (
        !summary ||
        summary.verificationCount === 0 ||
        (averageOverallRating ?? 0) < REVIEW_PASSING_RATING
      );
    }).length,
  };
}

// ---------------------------------------------------------------------------
// Film & Scene Queries
// ---------------------------------------------------------------------------

export async function getAllFilms(): Promise<FilmCard[]> {
  const rows = await db
    .select({
      id: schema.films.id,
      title: schema.films.title,
      director: schema.films.director,
      year: schema.films.year,
      posterUrl: schema.films.posterUrl,
    })
    .from(schema.films)
    .orderBy(schema.films.title);

  const filmIds = rows.map((r) => r.id);
  if (filmIds.length === 0) return [];

  const sceneCounts = await db
    .select({
      filmId: schema.scenes.filmId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.scenes)
    .where(inArray(schema.scenes.filmId, filmIds))
    .groupBy(schema.scenes.filmId);

  const shotAgg = await db
    .select({
      filmId: schema.shots.filmId,
      count: sql<number>`count(*)`.as("count"),
      totalDuration: sql<number>`coalesce(sum(${schema.shots.duration}), 0)`.as(
        "total_duration",
      ),
    })
    .from(schema.shots)
    .where(inArray(schema.shots.filmId, filmIds))
    .groupBy(schema.shots.filmId);

  const sceneMap = new Map(sceneCounts.map((r) => [r.filmId, Number(r.count)]));
  const shotMap = new Map(
    shotAgg.map((r) => [
      r.filmId,
      { count: Number(r.count), duration: Number(r.totalDuration) },
    ]),
  );

  return rows.map((film) => ({
    id: film.id,
    title: film.title,
    director: film.director,
    year: film.year ?? null,
    posterUrl: film.posterUrl ?? null,
    sceneCount: sceneMap.get(film.id) ?? 0,
    shotCount: shotMap.get(film.id)?.count ?? 0,
    totalDuration: shotMap.get(film.id)?.duration ?? 0,
  }));
}

export async function getFilmById(
  id: string,
): Promise<FilmWithDetails | null> {
  const [filmRow] = await db
    .select()
    .from(schema.films)
    .where(eq(schema.films.id, id))
    .limit(1);

  if (!filmRow) return null;

  const sceneRows = await db
    .select()
    .from(schema.scenes)
    .where(eq(schema.scenes.filmId, id))
    .orderBy(schema.scenes.sceneNumber);

  // Query shots by filmId directly instead of filtering by title (avoids N+1)
  const shotRows = await selectJoinedShots()
    .where(eq(schema.shots.filmId, id))
    .orderBy(schema.shots.startTc);
  const allShots = await attachObjectsToShots(shotRows.map(mapShotRow));

  const sceneMap = new Map<string, ShotWithDetails[]>();
  const ungrouped: ShotWithDetails[] = [];

  for (const shot of allShots) {
    if (shot.sceneId) {
      const list = sceneMap.get(shot.sceneId) ?? [];
      list.push(shot);
      sceneMap.set(shot.sceneId, list);
    } else {
      ungrouped.push(shot);
    }
  }

  const scenes: SceneWithShots[] = sceneRows.map((row) => {
    const shots = sceneMap.get(row.id) ?? [];
    return {
      id: row.id,
      filmId: row.filmId,
      sceneNumber: row.sceneNumber,
      title: row.title,
      description: row.description,
      startTc: row.startTc,
      endTc: row.endTc,
      totalDuration: row.totalDuration,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl,
      location: row.location,
      interiorExterior: row.interiorExterior,
      timeOfDay: row.timeOfDay,
      shots,
      shotCount: shots.length,
    };
  });

  if (ungrouped.length > 0) {
    scenes.push({
      id: "ungrouped",
      filmId: id,
      sceneNumber: scenes.length + 1,
      title: "Ungrouped Shots",
      description: null,
      startTc: null,
      endTc: null,
      totalDuration: null,
      videoUrl: null,
      thumbnailUrl: null,
      location: null,
      interiorExterior: null,
      timeOfDay: null,
      shots: ungrouped,
      shotCount: ungrouped.length,
    });
  }

  return {
    id: filmRow.id,
    title: filmRow.title,
    director: filmRow.director,
    year: filmRow.year ?? null,
    tmdbId: filmRow.tmdbId ?? null,
    posterUrl: filmRow.posterUrl ?? null,
    backdropUrl: filmRow.backdropUrl ?? null,
    overview: filmRow.overview ?? null,
    runtime: filmRow.runtime ?? null,
    genres: filmRow.genres ?? [],
    sceneCount: sceneRows.length,
    shotCount: allShots.length,
    totalDuration: allShots.reduce((sum, s) => sum + s.duration, 0),
    scenes,
  };
}

export async function getFilmCoverageStats(
  filmId: string,
): Promise<FilmCoverageStats> {
  const shotSizeRows = await db
    .select({
      shotSize: schema.shotMetadata.shotSize,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.shotMetadata)
    .innerJoin(schema.shots, eq(schema.shotMetadata.shotId, schema.shots.id))
    .where(eq(schema.shots.filmId, filmId))
    .groupBy(schema.shotMetadata.shotSize);

  const framingRows = await db
    .select({
      framing: schema.shotMetadata.framing,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.shotMetadata)
    .innerJoin(schema.shots, eq(schema.shotMetadata.shotId, schema.shots.id))
    .where(eq(schema.shots.filmId, filmId))
    .groupBy(schema.shotMetadata.framing);

  const [aggRow] = await db
    .select({
      shotCount: sql<number>`count(*)`.as("shot_count"),
      totalDuration: sql<number>`coalesce(sum(${schema.shots.duration}), 0)`.as(
        "total_duration",
      ),
      avgDuration: sql<number>`coalesce(avg(${schema.shots.duration}), 0)`.as(
        "avg_duration",
      ),
    })
    .from(schema.shots)
    .where(eq(schema.shots.filmId, filmId));

  const [sceneCountRow] = await db
    .select({
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.scenes)
    .where(eq(schema.scenes.filmId, filmId));

  return {
    shotSizeDistribution: Object.fromEntries(
      shotSizeRows.map((r) => [r.shotSize ?? "unknown", Number(r.count)]),
    ),
    framingFrequency: Object.fromEntries(
      framingRows.map((r) => [r.framing ?? "unknown", Number(r.count)]),
    ),
    averageShotLength: Number(aggRow?.avgDuration ?? 0),
    shotCount: Number(aggRow?.shotCount ?? 0),
    sceneCount: Number(sceneCountRow?.count ?? 0),
    totalDuration: Number(aggRow?.totalDuration ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Visualization Data
// ---------------------------------------------------------------------------

export async function getVisualizationData(): Promise<VisualizationData> {
  // Single joined query for all shot data needed by the viz dashboard
  const rows = await db
    .select({
      shotId: schema.shots.id,
      filmId: schema.films.id,
      filmTitle: schema.films.title,
      director: schema.films.director,
      sceneTitle: schema.scenes.title,
      sceneNumber: schema.scenes.sceneNumber,
      framing: schema.shotMetadata.framing,
      depth: schema.shotMetadata.depth,
      blocking: schema.shotMetadata.blocking,
      shotSize: schema.shotMetadata.shotSize,
      angleVertical: schema.shotMetadata.angleVertical,
      duration: schema.shots.duration,
      startTc: schema.shots.startTc,
      description: schema.shotSemantic.description,
    })
    .from(schema.shots)
    .innerJoin(schema.films, eq(schema.shots.filmId, schema.films.id))
    .leftJoin(schema.scenes, eq(schema.shots.sceneId, schema.scenes.id))
    .leftJoin(schema.shotMetadata, eq(schema.shots.id, schema.shotMetadata.shotId))
    .leftJoin(schema.shotSemantic, eq(schema.shots.id, schema.shotSemantic.shotId))
    .orderBy(schema.films.title, schema.shots.startTc);

  // Count objects per shot
  const objectCounts = await db
    .select({
      shotId: schema.shotObjects.shotId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(schema.shotObjects)
    .groupBy(schema.shotObjects.shotId);

  const objectCountMap = new Map(objectCounts.map((r) => [r.shotId, Number(r.count)]));

  // Compute shot indices per film
  const filmShotIndices = new Map<string, number>();
  const shots: VizShot[] = rows.map((row) => {
    const idx = filmShotIndices.get(row.filmId) ?? 0;
    filmShotIndices.set(row.filmId, idx + 1);
    return {
      id: row.shotId,
      filmId: row.filmId,
      filmTitle: row.filmTitle,
      director: row.director,
      sceneTitle: row.sceneTitle ?? null,
      sceneNumber: row.sceneNumber ?? null,
      shotIndex: idx,
      framing: row.framing ?? "centered",
      depth: row.depth ?? "medium",
      blocking: row.blocking ?? "single",
      shotSize: row.shotSize ?? "medium",
      angleVertical: row.angleVertical ?? "eye_level",
      duration: row.duration ?? 0,
      objectCount: objectCountMap.get(row.shotId) ?? 0,
      description: row.description ?? null,
    };
  });

  // Film summaries
  const filmMap = new Map<string, { id: string; title: string; director: string; shotCount: number; scenes: Set<string> }>();
  for (const shot of shots) {
    const existing = filmMap.get(shot.filmId);
    if (existing) {
      existing.shotCount++;
      if (shot.sceneTitle) existing.scenes.add(shot.sceneTitle);
    } else {
      filmMap.set(shot.filmId, {
        id: shot.filmId,
        title: shot.filmTitle,
        director: shot.director,
        shotCount: 1,
        scenes: new Set(shot.sceneTitle ? [shot.sceneTitle] : []),
      });
    }
  }

  const films = Array.from(filmMap.values()).map((f) => ({
    id: f.id,
    title: f.title,
    director: f.director,
    shotCount: f.shotCount,
    sceneCount: f.scenes.size,
  }));

  const directors = Array.from(new Set(shots.map((s) => s.director))).sort();

  return { shots, films, directors };
}
