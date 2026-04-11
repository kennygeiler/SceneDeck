import type {
  ShotObjectAttributes,
  ShotObjectKeyframe,
  ShotSceneContext,
} from "../db/schema";
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
} from "./taxonomy";

export type ClassifiedShot = {
  framing: string;
  depth: string;
  blocking: string;
  symmetry: string;
  dominant_lines: string;
  lighting_direction: string;
  lighting_quality: string;
  color_temperature: string;
  foreground_elements: string[];
  background_elements: string[];
  shot_size: string;
  angle_vertical: string;
  angle_horizontal: string;
  duration_cat: string;
  description: string;
  mood: string;
  lighting: string;
  subjects: string[];
  scene_title: string;
  scene_description: string;
  location: string;
  interior_exterior: string;
  time_of_day: string;
};

export type VerificationFieldKey =
  | "framing"
  | "depth"
  | "blocking"
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
    framing: FramingSlug;
    depth: DepthTypeSlug | null;
    blocking: BlockingTypeSlug | null;
    symmetry: SymmetryTypeSlug | null;
    dominantLines: DominantLineSlug | null;
    lightingDirection: LightingDirectionSlug | null;
    lightingQuality: LightingQualitySlug | null;
    colorTemperature: ColorTemperatureSlug | null;
    foregroundElements: string[];
    backgroundElements: string[];
    shotSize: ShotSizeSlug | null;
    angleVertical: VerticalAngleSlug | null;
    angleHorizontal: HorizontalAngleSlug | null;
    durationCategory: DurationCategorySlug | null;
    classificationSource: string | null;
    confidence: number | null;
    /** Pipeline / HITL queue state from `shot_metadata.review_status`. */
    reviewStatus: string | null;
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
  /** Structural HITL audit trail from `shots.hitl_audit`. */
  hitlAudit?: Array<{
    at: string;
    action: "split" | "merge";
    payload: Record<string, unknown>;
  }> | null;
  /** Derived from `verifications` rows for this shot (latest first). */
  trust?: {
    verificationCount: number;
    latestVerifiedAt: string | null;
    latestOverallRating: number | null;
  } | null;
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
  filmId: string;
  filmTitle: string;
  director: string;
  year: number | null;
  sourceFile: string | null;
  startTc: number | null;
  endTc: number | null;
  duration: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  framing: FramingSlug;
  depth: DepthTypeSlug;
  blocking: BlockingTypeSlug;
  symmetry: SymmetryTypeSlug;
  dominantLines: DominantLineSlug;
  lightingDirection: LightingDirectionSlug;
  lightingQuality: LightingQualitySlug;
  colorTemperature: ColorTemperatureSlug;
  shotSize: ShotSizeSlug;
  angleVertical: VerticalAngleSlug;
  angleHorizontal: HorizontalAngleSlug;
  durationCategory: DurationCategorySlug;
  classificationSource: string | null;
  reviewStatus: string | null;
  /** Auto-derived scene group from model (not screenplay truth). */
  autoGroupedSceneTitle: string | null;
  autoGroupedSceneNumber: number | null;
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

export type AccuracyStats = {
  overallAccuracy: number | null;
  perFieldAccuracy: Record<string, number | null>;
  perFilmAccuracy: Record<string, number | null>;
  totalShotsReviewed: number;
  totalCorrections: number;
};

export type CorrectionTransition = {
  field: string;
  from: string;
  to: string;
  count: number;
};

export type ConfidenceBucket = {
  bucket: string;
  totalShots: number;
  correctedShots: number;
  correctionRate: number;
};

export type CorrectionPatterns = {
  perFieldFrequency: Record<string, { corrections: number; total: number; rate: number }>;
  topTransitions: CorrectionTransition[];
  perFilmCorrectionRates: Record<string, { corrections: number; total: number; rate: number }>;
  confidenceVsAccuracy: ConfidenceBucket[];
  totalVerifications: number;
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
  /** Worker ingest uses this preset when `boundaryCutPresetId` is not passed on the request. */
  boundaryCutPresetId: string | null;
  boundaryCutPresetName: string | null;
};

/** Shots in this film that have at least one human verification row. */
export type FilmTrustSummary = {
  shotsWithHumanVerification: number;
  lastVerifiedAt: string | null;
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
  framingFrequency: Record<string, number>;
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
  framing: string;
  depth: string;
  blocking: string;
  shotSize: string;
  angleVertical: string;
  angleHorizontal: string;
  symmetry: string;
  dominantLines: string;
  lightingDirection: string;
  lightingQuality: string;
  colorTemperature: string;
  durationCategory: string;
  foregroundCount: number;
  backgroundCount: number;
  duration: number;
  objectCount: number;
  description: string | null;
  confidence: number | null;
  reviewStatus: string | null;
  verificationCount: number;
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
