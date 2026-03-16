import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";

import { db, schema } from "@/db";
import type { ShotWithDetails } from "@/lib/types";
import type {
  DirectionSlug,
  DurationCategorySlug,
  HorizontalAngleSlug,
  MovementTypeSlug,
  ShotSizeSlug,
  SpeedSlug,
  VerticalAngleSlug,
} from "@/lib/taxonomy";

export type ShotQueryFilters = {
  movementType?: string;
  director?: string;
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
    videoUrl: row.shotVideoUrl ?? null,
    thumbnailUrl: row.shotThumbnailUrl ?? null,
    createdAt: toIsoString(row.shotCreatedAt ?? null),
  };
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

  if (filters?.shotSize) {
    conditions.push(
      eq(schema.shotMetadata.shotSize, filters.shotSize as ShotSizeSlug),
    );
  }

  const rows = await selectJoinedShots()
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.shots.createdAt));

  return rows.map(mapShotRow);
}

export async function getShotById(id: string) {
  const [row] = await selectJoinedShots()
    .where(eq(schema.shots.id, id))
    .limit(1);

  return row ? mapShotRow(row) : null;
}

export async function searchShots(query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return [];
  }

  const searchTerm = `%${normalizedQuery}%`;
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
        relevance: getRelevanceScore(shot, normalizedQuery),
      };
    })
    .sort((left, right) => {
      if ((right.relevance ?? 0) !== (left.relevance ?? 0)) {
        return (right.relevance ?? 0) - (left.relevance ?? 0);
      }

      return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
    });
}
