import type {
  CompoundPart,
  ShotObjectAttributes,
  ShotObjectKeyframe,
  ShotSceneContext,
} from "@/db/schema";
import type {
  DirectionSlug,
  DurationCategorySlug,
  HorizontalAngleSlug,
  MovementTypeSlug,
  ShotSizeSlug,
  SpeedSlug,
  VerticalAngleSlug,
} from "@/lib/taxonomy";

export type VerificationFieldKey =
  | "movementType"
  | "direction"
  | "speed"
  | "shotSize"
  | "angleVertical"
  | "angleHorizontal";

export type VerificationFieldRatingsMap = Partial<
  Record<VerificationFieldKey, number | null>
>;

export type VerificationCorrectionsMap = Partial<
  Record<VerificationFieldKey, string | null>
>;

export type ShotWithDetails = {
  id: string;
  sceneId: string | null;
  film: {
    id: string;
    title: string;
    director: string;
    year: number | null;
    tmdbId: number | null;
    createdAt: string | null;
  };
  metadata: {
    id: string | null;
    shotId: string | null;
    movementType: MovementTypeSlug;
    direction: DirectionSlug;
    speed: SpeedSlug;
    shotSize: ShotSizeSlug;
    angleVertical: VerticalAngleSlug;
    angleHorizontal: HorizontalAngleSlug;
    angleSpecial: string | null;
    durationCategory: DurationCategorySlug;
    isCompound: boolean;
    compoundParts?: CompoundPart[];
    classificationSource: string | null;
  };
  semantic: {
    id: string | null;
    shotId: string | null;
    description: string | null;
    subjects: string[];
    mood: string | null;
    lighting: string | null;
    techniqueNotes: string | null;
  } | null;
  duration: number;
  sourceFile: string | null;
  startTc: number | null;
  endTc: number | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  objects: Array<{
    id: string;
    trackId: string;
    label: string;
    category: string | null;
    confidence: number | null;
    yoloClass: string | null;
    yoloConfidence: number | null;
    cinematicLabel: string | null;
    description: string | null;
    significance: string | null;
    keyframes: ShotObjectKeyframe[];
    startTime: number;
    endTime: number;
    attributes: ShotObjectAttributes | null;
    sceneContext: ShotSceneContext | null;
  }>;
  relevance?: number;
};

export type ExportShotRecord = {
  shotId: string;
  filmTitle: string;
  director: string;
  year: number | null;
  sourceFile: string | null;
  startTc: number | null;
  endTc: number | null;
  duration: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  movementType: MovementTypeSlug;
  direction: DirectionSlug;
  speed: SpeedSlug;
  shotSize: ShotSizeSlug;
  angleVertical: VerticalAngleSlug;
  angleHorizontal: HorizontalAngleSlug;
  angleSpecial: string | null;
  durationCategory: DurationCategorySlug;
  isCompound: boolean;
  compoundParts: string | null;
  compoundNotation: string | null;
  classificationSource: string | null;
  description: string | null;
  subjects: string;
  mood: string | null;
  lighting: string | null;
  techniqueNotes: string | null;
  createdAt: string | null;
};

export type VerificationRecord = {
  id: string;
  shotId: string;
  overallRating: number | null;
  fieldRatings: VerificationFieldRatingsMap | null;
  corrections: VerificationCorrectionsMap | null;
  notes: string | null;
  verifiedAt: string | null;
};

export type VerificationStats = {
  totalShots: number;
  verifiedShots: number;
  unverifiedShots: number;
  totalVerifications: number;
  averageOverallRating: number | null;
  reviewQueueCount: number;
};

export type ShotReviewQueueItem = ShotWithDetails & {
  verificationCount: number;
  averageOverallRating: number | null;
  latestVerifiedAt: string | null;
};

export type SceneWithShots = {
  id: string;
  filmId: string;
  sceneNumber: number;
  title: string | null;
  description: string | null;
  startTc: number | null;
  endTc: number | null;
  totalDuration: number | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  location: string | null;
  interiorExterior: string | null;
  timeOfDay: string | null;
  shots: ShotWithDetails[];
  shotCount: number;
};

export type FilmWithDetails = {
  id: string;
  title: string;
  director: string;
  year: number | null;
  tmdbId: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  runtime: number | null;
  genres: string[];
  sceneCount: number;
  shotCount: number;
  totalDuration: number;
  scenes: SceneWithShots[];
};

export type FilmCard = {
  id: string;
  title: string;
  director: string;
  year: number | null;
  posterUrl: string | null;
  sceneCount: number;
  shotCount: number;
  totalDuration: number;
};

export type FilmCoverageStats = {
  shotSizeDistribution: Record<string, number>;
  movementTypeFrequency: Record<string, number>;
  averageShotLength: number;
  shotCount: number;
  sceneCount: number;
  totalDuration: number;
};

export type VizShot = {
  id: string;
  filmId: string;
  filmTitle: string;
  director: string;
  sceneTitle: string | null;
  sceneNumber: number | null;
  shotIndex: number;
  movementType: string;
  direction: string;
  speed: string;
  shotSize: string;
  angleVertical: string;
  duration: number;
  objectCount: number;
  description: string | null;
};

export type VizFilm = {
  id: string;
  title: string;
  director: string;
  shotCount: number;
  sceneCount: number;
};

export type VisualizationData = {
  shots: VizShot[];
  films: VizFilm[];
  directors: string[];
};
