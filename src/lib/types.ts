import type { CompoundPart } from "@/db/schema";
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
  relevance?: number;
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
