import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  min,
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
  ShotReviewQueueItem,
  ShotWithDetails,
  VerificationCorrectionsMap,
  VerificationFieldRatingsMap,
  VerificationRecord,
  VerificationStats,
  VisualizationData,
  VizShot,
} from "@/lib/types";
import { DEFAULT_BOUNDARY_MERGE_GAP_SEC } from "@/lib/boundary-ensemble";
import { mapRawVisualizationRowToVizShot } from "@/lib/viz-shot-map";
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
  shotHitlAudit: schema.shots.hitlAudit,
  filmId: schema.films.id,
  filmTitle: schema.films.title,
  filmDirector: schema.films.director,
  filmYear: schema.films.year,
  filmTmdbId: schema.films.tmdbId,
  filmIngestProvenance: schema.films.ingestProvenance,
  filmCreatedAt: schema.films.createdAt,
  sceneGroupedTitle: schema.scenes.title,
  sceneGroupedNumber: schema.scenes.sceneNumber,
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
  metadataConfidence: schema.shotMetadata.confidence,
  metadataReviewStatus: schema.shotMetadata.reviewStatus,
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
    .leftJoin(schema.scenes, eq(schema.shots.sceneId, schema.scenes.id))
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
      confidence: row.metadataConfidence ?? null,
      reviewStatus: row.metadataReviewStatus ?? null,
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
    clipMediaAnchorStartTc: null,
    videoUrl: proxyBlobUrl(row.shotVideoUrl ?? null),
    thumbnailUrl: proxyBlobUrl(row.shotThumbnailUrl ?? null),
    createdAt: toIsoString(row.shotCreatedAt ?? null),
    hitlAudit: row.shotHitlAudit ?? null,
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

async function attachClipMediaAnchorsToShots(
  shots: ShotWithDetails[],
): Promise<ShotWithDetails[]> {
  if (shots.length === 0) {
    return shots;
  }

  const ids = shots.map((s) => s.id);
  const shotRows = await db
    .select({
      id: schema.shots.id,
      filmId: schema.shots.filmId,
      videoUrl: schema.shots.videoUrl,
    })
    .from(schema.shots)
    .where(inArray(schema.shots.id, ids));

  const dbByShotId = new Map(shotRows.map((r) => [r.id, r]));
  const uniquePairs = new Map<string, { filmId: string; videoUrl: string }>();

  for (const r of shotRows) {
    if (!r.videoUrl) {
      continue;
    }
    const k = `${r.filmId}\x1e${r.videoUrl}`;
    uniquePairs.set(k, { filmId: r.filmId, videoUrl: r.videoUrl });
  }

  const anchorByKey = new Map<string, number>();
  if (uniquePairs.size > 0) {
    const pairConditions = [...uniquePairs.values()].map(({ filmId, videoUrl }) =>
      and(eq(schema.shots.filmId, filmId), eq(schema.shots.videoUrl, videoUrl)),
    );
    const rows = await db
      .select({
        filmId: schema.shots.filmId,
        videoUrl: schema.shots.videoUrl,
        anchor: min(schema.shots.startTc),
      })
      .from(schema.shots)
      .where(and(or(...pairConditions), isNotNull(schema.shots.startTc)))
      .groupBy(schema.shots.filmId, schema.shots.videoUrl);

    for (const row of rows) {
      if (row.videoUrl != null && row.anchor != null) {
        anchorByKey.set(`${row.filmId}\x1e${row.videoUrl}`, Number(row.anchor));
      }
    }
  }

  return shots.map((shot) => {
    const dbRow = dbByShotId.get(shot.id);
    if (!dbRow?.videoUrl || shot.startTc == null) {
      return { ...shot, clipMediaAnchorStartTc: null };
    }
    const k = `${dbRow.filmId}\x1e${dbRow.videoUrl}`;
    const anchor = anchorByKey.get(k);
    return {
      ...shot,
      clipMediaAnchorStartTc: anchor ?? shot.startTc,
    };
  });
}

async function attachObjectsToShots(shots: ShotWithDetails[]) {
  const objectsByShotId = await getObjectsGroupedByShotIds(shots.map((shot) => shot.id));

  const withObjects = shots.map((shot) => ({
    ...shot,
    objects: objectsByShotId.get(shot.id) ?? [],
  }));

  return attachClipMediaAnchorsToShots(withObjects);
}

function mapExportShotRow(row: ShotRow): ExportShotRecord {
  return {
    shotId: row.shotId,
    filmId: row.filmId,
    filmTitle: row.filmTitle,
    director: row.filmDirector,
    year: row.filmYear ?? null,
    startTc: row.shotStartTc ?? null,
    endTc: row.shotEndTc ?? null,
    duration: row.shotDuration ?? 0,
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
    reviewStatus: row.metadataReviewStatus ?? null,
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

/** Chronological next shot in the same film whose start aligns with `afterEndTc` (boundary tolerance). */
export async function getNextShotAfterBoundary(
  filmId: string,
  afterEndTc: number,
  /** Align with boundary merge ε for split-clip adjacency. */
  epsilonSec = DEFAULT_BOUNDARY_MERGE_GAP_SEC,
): Promise<{ id: string; startTc: number; endTc: number | null } | null> {
  const rows = await db
    .select({
      id: schema.shots.id,
      startTc: schema.shots.startTc,
      endTc: schema.shots.endTc,
    })
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.filmId, filmId),
        sql`${schema.shots.startTc} is not null`,
        gte(schema.shots.startTc, afterEndTc - epsilonSec),
      ),
    )
    .orderBy(asc(schema.shots.startTc))
    .limit(1);

  const row = rows[0];
  if (!row || row.startTc == null) return null;
  if (Math.abs(row.startTc - afterEndTc) > epsilonSec) return null;
  return { id: row.id, startTc: row.startTc, endTc: row.endTc };
}

async function getClipTimelinePeersForShot(
  filmId: string,
  videoUrl: string | null,
): Promise<{ id: string; startTc: number; endTc: number }[]> {
  if (!videoUrl) {
    return [];
  }
  const rows = await db
    .select({
      id: schema.shots.id,
      startTc: schema.shots.startTc,
      endTc: schema.shots.endTc,
    })
    .from(schema.shots)
    .where(
      and(
        eq(schema.shots.filmId, filmId),
        eq(schema.shots.videoUrl, videoUrl),
        isNotNull(schema.shots.startTc),
        isNotNull(schema.shots.endTc),
      ),
    )
    .orderBy(asc(schema.shots.startTc));

  return rows.map((r) => ({
    id: r.id,
    startTc: Number(r.startTc),
    endTc: Number(r.endTc),
  }));
}

export async function getShotById(id: string) {
  const [row] = await selectJoinedShots()
    .where(eq(schema.shots.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const [shot] = await attachObjectsToShots([mapShotRow(row)]);
  if (!shot) {
    return null;
  }

  const clipTimelinePeers = await getClipTimelinePeersForShot(shot.film.id, shot.videoUrl);
  const shotWithPeers = { ...shot, clipTimelinePeers };

  const verifications = await getVerificationsForShot(id);
  if (verifications.length === 0) {
    return { ...shotWithPeers, trust: null };
  }

  const latest = verifications[0];
  return {
    ...shotWithPeers,
    trust: {
      verificationCount: verifications.length,
      latestVerifiedAt: latest.verifiedAt,
      latestOverallRating: latest.overallRating,
    },
  };
}

/** Shots that need a fresh Gemini classification pass (same predicate as film timeline / shot-pipeline-health). */
export async function getFilmReclassifyTargets(filmId: string): Promise<{
  shotIds: string[];
  film: { title: string; director: string; year: number | null };
} | null> {
  const [film] = await db
    .select({
      title: schema.films.title,
      director: schema.films.director,
      year: schema.films.year,
    })
    .from(schema.films)
    .where(eq(schema.films.id, filmId))
    .limit(1);
  if (!film) return null;

  const rows = await db
    .select({ id: schema.shots.id })
    .from(schema.shots)
    .innerJoin(schema.shotMetadata, eq(schema.shotMetadata.shotId, schema.shots.id))
    .where(
      and(
        eq(schema.shots.filmId, filmId),
        or(
          eq(schema.shotMetadata.classificationSource, "gemini_fallback"),
          eq(schema.shotMetadata.reviewStatus, "needs_review"),
        ),
      ),
    )
    .orderBy(asc(schema.shots.startTc));

  return {
    shotIds: rows.map((r) => r.id),
    film: { title: film.title, director: film.director, year: film.year },
  };
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

export async function getShotsForExportByIds(shotIds: string[]) {
  if (shotIds.length === 0) {
    return [];
  }
  const rows = await selectJoinedShots()
    .where(inArray(schema.shots.id, shotIds))
    .orderBy(schema.films.title, schema.shots.startTc);
  return rows.map(mapExportShotRow);
}

export async function getFilmManifestRows(filmIds: string[]) {
  if (filmIds.length === 0) {
    return [];
  }
  return db
    .select({
      filmId: schema.films.id,
      title: schema.films.title,
      director: schema.films.director,
      year: schema.films.year,
      ingestProvenance: schema.films.ingestProvenance,
    })
    .from(schema.films)
    .where(inArray(schema.films.id, filmIds));
}

/** Playback URLs for a single shot (eval UI); not included in bulk export. */
export async function getShotClipUrlsById(
  shotId: string,
): Promise<{ videoUrl: string | null; thumbnailUrl: string | null } | null> {
  const [row] = await db
    .select({
      videoUrl: schema.shots.videoUrl,
      thumbnailUrl: schema.shots.thumbnailUrl,
    })
    .from(schema.shots)
    .where(eq(schema.shots.id, shotId))
    .limit(1);
  if (!row) return null;
  return {
    videoUrl: proxyBlobUrl(row.videoUrl ?? null),
    thumbnailUrl: proxyBlobUrl(row.thumbnailUrl ?? null),
  };
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

  const sorted = rows
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

  return attachClipMediaAnchorsToShots(sorted);
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

    if (semanticResults !== null) {
      return semanticResults;
    }

    console.warn(
      "[searchShots] No rows in shot_embeddings (empty index). Using ILIKE text fallback. " +
        "Run `pnpm db:embeddings` after ingesting shots for vector similarity; see AGENTS.md (AC-07 / search).",
    );
  } catch (error) {
    console.error(
      "[searchShots] Vector semantic search failed; using ILIKE fallback. Operators: check pgvector extension, embedding dimensions, and OpenAI quota.",
      error,
    );
  }

  console.warn(
    `[searchShots] ILIKE text search path (query length=${normalizedQuery.length} chars). Not ideal at large corpus scale — ensure embeddings backfill and monitor this prefix.`,
  );
  return await searchShotsWithIlike(normalizedQuery);
}

type RankedImageEmbeddingRow = {
  shotId: string;
  distance: number;
};

/** Phase D: pgvector similarity on thumbnail CLIP embeddings (`pnpm db:embeddings:image`). */
export async function getVisuallySimilarShots(
  shotId: string,
  limit = 12,
): Promise<ShotWithDetails[]> {
  const cap = Math.min(Math.max(limit, 1), 30);
  const [base] = await db
    .select({ embedding: schema.shotImageEmbeddings.embedding })
    .from(schema.shotImageEmbeddings)
    .where(eq(schema.shotImageEmbeddings.shotId, shotId));

  if (!base) {
    return [];
  }

  const queryVector = toVectorLiteral(base.embedding);
  const embeddingResult = await db.execute(
    sql<RankedImageEmbeddingRow>`
      SELECT shot_id AS "shotId", embedding <=> ${queryVector}::vector AS "distance"
      FROM ${schema.shotImageEmbeddings}
      WHERE shot_id <> ${shotId}::uuid
      ORDER BY embedding <=> ${queryVector}::vector
      LIMIT ${cap}
    `,
  );
  const ranked = embeddingResult.rows as RankedImageEmbeddingRow[];
  const shotIds = ranked.map((row) => row.shotId);

  if (shotIds.length === 0) {
    return [];
  }

  const rows = await selectJoinedShots().where(inArray(schema.shots.id, shotIds));
  const shotsById = new Map(rows.map((row) => [row.shotId, mapShotRow(row)]));
  const ordered: ShotWithDetails[] = [];

  for (const row of ranked) {
    const shot = shotsById.get(row.shotId);
    if (shot) {
      ordered.push({
        ...shot,
        relevance: 1 - row.distance,
      });
    }
  }

  return attachObjectsToShots(ordered);
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

      // Within unverified shots, sort by confidence ascending (least confident first)
      if (left.verificationCount === 0 && right.verificationCount === 0) {
        const leftConf = left.metadata.confidence ?? Number.POSITIVE_INFINITY;
        const rightConf = right.metadata.confidence ?? Number.POSITIVE_INFINITY;
        if (leftConf !== rightConf) {
          return leftConf - rightConf;
        }
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
// Accuracy Stats (M3 gate metric)
// ---------------------------------------------------------------------------

const ACCURACY_FIELDS = [
  "framing",
  "depth",
  "blocking",
  "shotSize",
  "angleVertical",
  "angleHorizontal",
] as const;

export async function getAccuracyStats(): Promise<
  import("@/lib/types").AccuracyStats
> {
  // Fetch all verifications for human_corrected shots, joined with film title
  const rows = await db
    .select({
      shotId: schema.verifications.shotId,
      fieldRatings: schema.verifications.fieldRatings,
      corrections: schema.verifications.corrections,
      filmTitle: schema.films.title,
    })
    .from(schema.verifications)
    .innerJoin(
      schema.shotMetadata,
      eq(schema.verifications.shotId, schema.shotMetadata.shotId),
    )
    .innerJoin(schema.shots, eq(schema.verifications.shotId, schema.shots.id))
    .innerJoin(schema.films, eq(schema.shots.filmId, schema.films.id))
    .where(
      or(
        eq(schema.shotMetadata.reviewStatus, "human_corrected"),
        eq(schema.shotMetadata.reviewStatus, "human_verified"),
      ),
    );

  if (rows.length === 0) {
    return {
      overallAccuracy: null,
      perFieldAccuracy: Object.fromEntries(
        ACCURACY_FIELDS.map((f) => [f, null]),
      ),
      perFilmAccuracy: {},
      totalShotsReviewed: 0,
      totalCorrections: 0,
    };
  }

  // Per-field: count rated fields vs corrected fields
  const fieldCorrect: Record<string, number> = {};
  const fieldTotal: Record<string, number> = {};

  // Per-film: count rated fields vs corrected fields
  const filmCorrect: Record<string, number> = {};
  const filmTotal: Record<string, number> = {};

  let overallCorrect = 0;
  let overallTotal = 0;
  let totalCorrections = 0;
  const reviewedShotIds = new Set<string>();

  for (const row of rows) {
    const ratings = (row.fieldRatings ?? {}) as Record<string, number | null>;
    const corrections = (row.corrections ?? {}) as Record<string, string | null>;
    const film = row.filmTitle;

    reviewedShotIds.add(row.shotId);

    for (const field of ACCURACY_FIELDS) {
      if (ratings[field] == null) continue;

      fieldTotal[field] = (fieldTotal[field] ?? 0) + 1;
      filmTotal[film] = (filmTotal[film] ?? 0) + 1;
      overallTotal++;

      const wasCorrected =
        corrections[field] != null && corrections[field]!.trim().length > 0;

      if (wasCorrected) {
        totalCorrections++;
      } else {
        fieldCorrect[field] = (fieldCorrect[field] ?? 0) + 1;
        filmCorrect[film] = (filmCorrect[film] ?? 0) + 1;
        overallCorrect++;
      }
    }
  }

  const toPercent = (correct: number, total: number) =>
    total > 0 ? Math.round((correct / total) * 1000) / 10 : null;

  return {
    overallAccuracy: toPercent(overallCorrect, overallTotal),
    perFieldAccuracy: Object.fromEntries(
      ACCURACY_FIELDS.map((f) => [
        f,
        toPercent(fieldCorrect[f] ?? 0, fieldTotal[f] ?? 0),
      ]),
    ),
    perFilmAccuracy: Object.fromEntries(
      Object.keys(filmTotal).map((film) => [
        film,
        toPercent(filmCorrect[film] ?? 0, filmTotal[film] ?? 0),
      ]),
    ),
    totalShotsReviewed: reviewedShotIds.size,
    totalCorrections,
  };
}

// ---------------------------------------------------------------------------
// Correction Pattern Aggregation (prompt-tuning insights)
// ---------------------------------------------------------------------------

export async function getCorrectionPatterns(): Promise<
  import("@/lib/types").CorrectionPatterns
> {
  // Fetch all verifications joined with shot metadata (for confidence) and film
  const rows = await db
    .select({
      shotId: schema.verifications.shotId,
      fieldRatings: schema.verifications.fieldRatings,
      corrections: schema.verifications.corrections,
      confidence: schema.shotMetadata.confidence,
      filmTitle: schema.films.title,
    })
    .from(schema.verifications)
    .innerJoin(
      schema.shotMetadata,
      eq(schema.verifications.shotId, schema.shotMetadata.shotId),
    )
    .innerJoin(schema.shots, eq(schema.verifications.shotId, schema.shots.id))
    .innerJoin(schema.films, eq(schema.shots.filmId, schema.films.id));

  if (rows.length === 0) {
    return {
      perFieldFrequency: {},
      topTransitions: [],
      perFilmCorrectionRates: {},
      confidenceVsAccuracy: [],
      totalVerifications: 0,
    };
  }

  // --- 1. Per-field correction frequency ---
  const fieldCorrections: Record<string, number> = {};
  const fieldTotal: Record<string, number> = {};

  // --- 2. Correction transitions (original → corrected) ---
  // We need to look at the fieldRatings to see which fields were rated,
  // and corrections to see what they were changed to.
  // The "from" value is in shotMetadata (the AI value), but since corrections
  // overwrite metadata, we need to derive from: the original AI value isn't stored
  // post-correction. However, the corrections JSONB stores the NEW value, and
  // the verification was done BEFORE the write-back. We'll track transitions as
  // field → corrected value. To get the "from", we need the metadata value at
  // time of review. Since write-back happens on submit, and we join shotMetadata
  // (which now has the corrected value), for corrected shots the metadata IS the
  // corrected value. For the original value, we'd need to look at uncorrected
  // shots or accept we only have the correction target.
  //
  // Actually: the corrections JSONB in verifications stores the corrected value,
  // and the shotMetadata for "human_corrected" shots has already been updated.
  // But for "human_verified" shots, shotMetadata still has the AI value.
  // We can use the fieldRatings to detect which fields were corrected (rating < 3
  // and a correction value exists). The "from" is unknown per-verification since
  // metadata was overwritten. We'll report transitions as "field: <corrected_to>"
  // with counts — the key insight for prompt tuning is WHAT values the AI gets
  // wrong and WHAT they should be.
  const transitionCounts = new Map<string, number>();

  // --- 3. Per-film correction rates ---
  const filmCorrections: Record<string, number> = {};
  const filmTotal: Record<string, number> = {};

  // --- 4. Confidence buckets ---
  type BucketAccum = { total: number; corrected: number };
  const confidenceBuckets: Record<string, BucketAccum> = {
    "0.0–0.2": { total: 0, corrected: 0 },
    "0.2–0.4": { total: 0, corrected: 0 },
    "0.4–0.6": { total: 0, corrected: 0 },
    "0.6–0.8": { total: 0, corrected: 0 },
    "0.8–1.0": { total: 0, corrected: 0 },
    "no score": { total: 0, corrected: 0 },
  };

  function getBucket(confidence: number | null): string {
    if (confidence == null) return "no score";
    if (confidence < 0.2) return "0.0–0.2";
    if (confidence < 0.4) return "0.2–0.4";
    if (confidence < 0.6) return "0.4–0.6";
    if (confidence < 0.8) return "0.6–0.8";
    return "0.8–1.0";
  }

  for (const row of rows) {
    const ratings = (row.fieldRatings ?? {}) as Record<string, number | null>;
    const corrections = (row.corrections ?? {}) as Record<string, string | null>;
    const film = row.filmTitle;
    const bucket = getBucket(row.confidence);
    let shotHadCorrection = false;

    for (const field of ACCURACY_FIELDS) {
      if (ratings[field] == null) continue;

      fieldTotal[field] = (fieldTotal[field] ?? 0) + 1;
      filmTotal[film] = (filmTotal[film] ?? 0) + 1;

      const correctedTo = corrections[field];
      const wasCorrected = correctedTo != null && correctedTo.trim().length > 0;

      if (wasCorrected) {
        fieldCorrections[field] = (fieldCorrections[field] ?? 0) + 1;
        filmCorrections[film] = (filmCorrections[film] ?? 0) + 1;
        shotHadCorrection = true;

        // Track transition: "field: → correctedValue"
        const key = `${field}:→ ${correctedTo.trim()}`;
        transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
      }
    }

    confidenceBuckets[bucket].total++;
    if (shotHadCorrection) {
      confidenceBuckets[bucket].corrected++;
    }
  }

  // Build per-field frequency
  const perFieldFrequency: Record<
    string,
    { corrections: number; total: number; rate: number }
  > = {};
  for (const field of ACCURACY_FIELDS) {
    const corr = fieldCorrections[field] ?? 0;
    const tot = fieldTotal[field] ?? 0;
    perFieldFrequency[field] = {
      corrections: corr,
      total: tot,
      rate: tot > 0 ? Math.round((corr / tot) * 1000) / 10 : 0,
    };
  }

  // Build top transitions sorted by count desc
  const topTransitions = Array.from(transitionCounts.entries())
    .map(([key, count]) => {
      const [field, toValue] = key.split(":→ ");
      return { field, from: "(AI value)", to: toValue, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  // Build per-film correction rates
  const perFilmCorrectionRates: Record<
    string,
    { corrections: number; total: number; rate: number }
  > = {};
  for (const film of Object.keys(filmTotal)) {
    const corr = filmCorrections[film] ?? 0;
    const tot = filmTotal[film];
    perFilmCorrectionRates[film] = {
      corrections: corr,
      total: tot,
      rate: tot > 0 ? Math.round((corr / tot) * 1000) / 10 : 0,
    };
  }

  // Build confidence buckets
  const confidenceVsAccuracy = Object.entries(confidenceBuckets)
    .filter(([, v]) => v.total > 0)
    .map(([bucket, v]) => ({
      bucket,
      totalShots: v.total,
      correctedShots: v.corrected,
      correctionRate: Math.round((v.corrected / v.total) * 1000) / 10,
    }));

  return {
    perFieldFrequency,
    topTransitions,
    perFilmCorrectionRates,
    confidenceVsAccuracy,
    totalVerifications: rows.length,
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

  const shotMap = new Map(
    shotAgg.map((r) => [
      r.filmId,
      { count: Number(r.count), duration: Number(r.totalDuration) },
    ]),
  );

  const attentionAgg =
    filmIds.length === 0
      ? []
      : await db
          .select({
            filmId: schema.shots.filmId,
            count: sql<number>`cast(count(*) as int)`.as("attention_count"),
          })
          .from(schema.shots)
          .innerJoin(
            schema.shotMetadata,
            eq(schema.shotMetadata.shotId, schema.shots.id),
          )
          .where(
            and(
              inArray(schema.shots.filmId, filmIds),
              or(
                eq(schema.shotMetadata.classificationSource, "gemini_fallback"),
                eq(schema.shotMetadata.reviewStatus, "needs_review"),
              ),
            ),
          )
          .groupBy(schema.shots.filmId);

  const attentionMap = new Map(
    attentionAgg.map((r) => [r.filmId, Number(r.count)]),
  );

  return rows.map((film) => ({
    id: film.id,
    title: film.title,
    director: film.director,
    year: film.year ?? null,
    posterUrl: film.posterUrl ?? null,
    shotCount: shotMap.get(film.id)?.count ?? 0,
    totalDuration: shotMap.get(film.id)?.duration ?? 0,
    pipelineAttentionShotCount: attentionMap.get(film.id) ?? 0,
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

  let boundaryCutPresetName: string | null = null;
  if (filmRow.boundaryCutPresetId) {
    const [bp] = await db
      .select({ name: schema.boundaryCutPresets.name })
      .from(schema.boundaryCutPresets)
      .where(eq(schema.boundaryCutPresets.id, filmRow.boundaryCutPresetId))
      .limit(1);
    boundaryCutPresetName = bp?.name ?? null;
  }

  // Query shots by filmId directly instead of filtering by title (avoids N+1)
  const shotRows = await selectJoinedShots()
    .where(eq(schema.shots.filmId, id))
    .orderBy(schema.shots.startTc);
  const allShots = await attachObjectsToShots(shotRows.map(mapShotRow));

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
    shotCount: allShots.length,
    totalDuration: allShots.reduce((sum, s) => sum + s.duration, 0),
    shots: allShots,
    boundaryCutPresetId: filmRow.boundaryCutPresetId ?? null,
    boundaryCutPresetName,
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

  return {
    shotSizeDistribution: Object.fromEntries(
      shotSizeRows.map((r) => [r.shotSize ?? "unknown", Number(r.count)]),
    ),
    framingFrequency: Object.fromEntries(
      framingRows.map((r) => [r.framing ?? "unknown", Number(r.count)]),
    ),
    averageShotLength: Number(aggRow?.avgDuration ?? 0),
    shotCount: Number(aggRow?.shotCount ?? 0),
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
      angleHorizontal: schema.shotMetadata.angleHorizontal,
      symmetry: schema.shotMetadata.symmetry,
      dominantLines: schema.shotMetadata.dominantLines,
      lightingDirection: schema.shotMetadata.lightingDirection,
      lightingQuality: schema.shotMetadata.lightingQuality,
      colorTemperature: schema.shotMetadata.colorTemperature,
      durationCat: schema.shotMetadata.durationCat,
      foregroundElements: schema.shotMetadata.foregroundElements,
      backgroundElements: schema.shotMetadata.backgroundElements,
      confidence: schema.shotMetadata.confidence,
      reviewStatus: schema.shotMetadata.reviewStatus,
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

  const verificationRows = await db
    .select({
      shotId: schema.verifications.shotId,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(schema.verifications)
    .groupBy(schema.verifications.shotId);

  const verificationCountMap = new Map(
    verificationRows.map((r) => [r.shotId, Number(r.n)]),
  );

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
    return mapRawVisualizationRowToVizShot(row, idx, objectCountMap.get(row.shotId) ?? 0, verificationCountMap.get(row.shotId) ?? 0);
  });

  // Film summaries
  const filmMap = new Map<string, { id: string; title: string; director: string; shotCount: number }>();
  for (const shot of shots) {
    const existing = filmMap.get(shot.filmId);
    if (existing) {
      existing.shotCount++;
    } else {
      filmMap.set(shot.filmId, {
        id: shot.filmId,
        title: shot.filmTitle,
        director: shot.director,
        shotCount: 1,
      });
    }
  }

  const films = Array.from(filmMap.values()).map((f) => ({
    id: f.id,
    title: f.title,
    director: f.director,
    shotCount: f.shotCount,
  }));

  const directors = Array.from(new Set(shots.map((s) => s.director))).sort();

  return { shots, films, directors };
}
