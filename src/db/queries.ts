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
  if (!url.includes("private.blob.vercel-storage.com")) return url;
  return `/api/blob/${encodeURIComponent(url)}`;
}
import {
  generateTextEmbedding,
  toVectorLiteral,
} from "@/db/embeddings";
import type {
  ExportShotRecord,
  ShotReviewQueueItem,
  ShotWithDetails,
  VerificationCorrectionsMap,
  VerificationFieldRatingsMap,
  VerificationRecord,
  VerificationStats,
} from "@/lib/types";
import type {
  DirectionSlug,
  DurationCategorySlug,
  HorizontalAngleSlug,
  MovementTypeSlug,
  ShotSizeSlug,
  SpeedSlug,
  VerticalAngleSlug,
} from "@/lib/taxonomy";

const REVIEW_PASSING_RATING = 4;

export type ShotQueryFilters = {
  movementType?: string;
  director?: string;
  filmTitle?: string;
  shotSize?: string;
};

const shotSelection = {
  shotId: schema.shots.id,
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
  metadataMovementType: schema.shotMetadata.movementType,
  metadataDirection: schema.shotMetadata.direction,
  metadataSpeed: schema.shotMetadata.speed,
  metadataShotSize: schema.shotMetadata.shotSize,
  metadataAngleVertical: schema.shotMetadata.angleVertical,
  metadataAngleHorizontal: schema.shotMetadata.angleHorizontal,
  metadataAngleSpecial: schema.shotMetadata.angleSpecial,
  metadataDurationCat: schema.shotMetadata.durationCat,
  metadataIsCompound: schema.shotMetadata.isCompound,
  metadataCompoundParts: schema.shotMetadata.compoundParts,
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
  movementType?: string;
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

function stringifyCompoundParts(
  compoundParts:
    | Array<{
        type: string;
        direction: string;
      }>
    | null
    | undefined,
) {
  if (!compoundParts || compoundParts.length === 0) {
    return null;
  }

  return JSON.stringify(compoundParts);
}

function toCompoundNotation(
  compoundParts:
    | Array<{
        type: string;
        direction: string;
      }>
    | null
    | undefined,
) {
  if (!compoundParts || compoundParts.length === 0) {
    return null;
  }

  return compoundParts
    .map((part) => `${part.type}:${part.direction}`)
    .join(" + ");
}

function mapShotRow(row: ShotRow): ShotWithDetails {
  return {
    id: row.shotId,
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
      movementType: (row.metadataMovementType ?? "static") as MovementTypeSlug,
      direction: (row.metadataDirection ?? "none") as DirectionSlug,
      speed: (row.metadataSpeed ?? "moderate") as SpeedSlug,
      shotSize: (row.metadataShotSize ?? "medium") as ShotSizeSlug,
      angleVertical: (row.metadataAngleVertical ?? "eye_level") as VerticalAngleSlug,
      angleHorizontal: (row.metadataAngleHorizontal ?? "frontal") as HorizontalAngleSlug,
      angleSpecial: row.metadataAngleSpecial ?? null,
      durationCategory: (row.metadataDurationCat ?? "standard") as DurationCategorySlug,
      isCompound: row.metadataIsCompound ?? false,
      compoundParts: row.metadataCompoundParts ?? undefined,
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
    movementType: (row.metadataMovementType ?? "static") as MovementTypeSlug,
    direction: (row.metadataDirection ?? "none") as DirectionSlug,
    speed: (row.metadataSpeed ?? "moderate") as SpeedSlug,
    shotSize: (row.metadataShotSize ?? "medium") as ShotSizeSlug,
    angleVertical: (row.metadataAngleVertical ?? "eye_level") as VerticalAngleSlug,
    angleHorizontal: (row.metadataAngleHorizontal ?? "frontal") as HorizontalAngleSlug,
    angleSpecial: row.metadataAngleSpecial ?? null,
    durationCategory: (row.metadataDurationCat ?? "standard") as DurationCategorySlug,
    isCompound: row.metadataIsCompound ?? false,
    compoundParts: stringifyCompoundParts(row.metadataCompoundParts),
    compoundNotation: toCompoundNotation(row.metadataCompoundParts),
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
  const movementType = shot.metadata.movementType.toLowerCase();
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

  if (movementType === normalizedQuery) {
    score += 6;
  } else if (movementType.includes(normalizedQuery)) {
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
      filters.movementType &&
      shot.metadata.movementType !== filters.movementType
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

  if (filters?.movementType) {
    conditions.push(
      eq(
        schema.shotMetadata.movementType,
        filters.movementType as MovementTypeSlug,
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
  movementType?: string;
  director?: string;
  filmTitle?: string;
  shotSize?: string;
}) {
  const conditions: SQL[] = [];

  if (filters?.movementType) {
    conditions.push(
      eq(
        schema.shotMetadata.movementType,
        filters.movementType as MovementTypeSlug,
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
        ilike(schema.shotMetadata.movementType, searchTerm),
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
