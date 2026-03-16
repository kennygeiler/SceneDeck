import type {
  DirectionSlug,
  DurationCategorySlug,
  HorizontalAngleSlug,
  MovementTypeSlug,
  ShotSizeSlug,
  SpeedSlug,
  VerticalAngleSlug,
} from "@/lib/taxonomy";

export type MockFilm = {
  title: string;
  director: string;
  year: number;
};

export type MockShotCompoundPart = {
  type: MovementTypeSlug;
  direction: DirectionSlug;
};

export type MockShotMetadata = {
  movementType: MovementTypeSlug;
  direction: DirectionSlug;
  speed: SpeedSlug;
  shotSize: ShotSizeSlug;
  angleVertical: VerticalAngleSlug;
  angleHorizontal: HorizontalAngleSlug;
  durationCategory: DurationCategorySlug;
  isCompound: boolean;
  compoundParts?: MockShotCompoundPart[];
};

export type MockShot = {
  id: string;
  film: MockFilm;
  metadata: MockShotMetadata;
  duration: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
};

export const mockShots: MockShot[] = [
  {
    id: "shot-001",
    film: {
      title: "2001: A Space Odyssey",
      director: "Stanley Kubrick",
      year: 1968,
    },
    metadata: {
      movementType: "dolly",
      direction: "in",
      speed: "slow",
      shotSize: "wide",
      angleVertical: "eye_level",
      angleHorizontal: "frontal",
      durationCategory: "long_take",
      isCompound: false,
    },
    duration: 12.5,
    videoUrl: null,
    thumbnailUrl: null,
  },
  {
    id: "shot-002",
    film: {
      title: "Whiplash",
      director: "Damien Chazelle",
      year: 2014,
    },
    metadata: {
      movementType: "whip_pan",
      direction: "right",
      speed: "snap",
      shotSize: "close",
      angleVertical: "eye_level",
      angleHorizontal: "three_quarter",
      durationCategory: "flash",
      isCompound: false,
    },
    duration: 0.4,
    videoUrl: null,
    thumbnailUrl: null,
  },
  {
    id: "shot-003",
    film: {
      title: "The Shining",
      director: "Stanley Kubrick",
      year: 1980,
    },
    metadata: {
      movementType: "steadicam",
      direction: "forward",
      speed: "moderate",
      shotSize: "medium",
      angleVertical: "low_angle",
      angleHorizontal: "rear",
      durationCategory: "long_take",
      isCompound: true,
      compoundParts: [
        { type: "steadicam", direction: "forward" },
        { type: "tilt", direction: "down" },
      ],
    },
    duration: 35,
    videoUrl: null,
    thumbnailUrl: null,
  },
];

export function getMockShotById(id: string) {
  return mockShots.find((shot) => shot.id === id);
}
