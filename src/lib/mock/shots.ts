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

export type MockFilm = {
  title: string;
  director: string;
  year: number;
};

export type MockShotMetadata = {
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
      framing: "centered",
      depth: "deep_staging",
      blocking: "single",
      symmetry: "symmetric",
      dominantLines: "converging",
      lightingDirection: "natural",
      lightingQuality: "soft",
      colorTemperature: "cool",
      shotSize: "wide",
      angleVertical: "eye_level",
      angleHorizontal: "frontal",
      durationCategory: "long_take",
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
      framing: "rule_of_thirds_left",
      depth: "shallow",
      blocking: "single",
      symmetry: "asymmetric",
      dominantLines: "diagonal",
      lightingDirection: "side",
      lightingQuality: "hard",
      colorTemperature: "warm",
      shotSize: "close",
      angleVertical: "eye_level",
      angleHorizontal: "three_quarter",
      durationCategory: "flash",
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
      framing: "centered",
      depth: "deep_staging",
      blocking: "single",
      symmetry: "symmetric",
      dominantLines: "converging",
      lightingDirection: "natural",
      lightingQuality: "soft",
      colorTemperature: "neutral",
      shotSize: "medium",
      angleVertical: "low_angle",
      angleHorizontal: "rear",
      durationCategory: "long_take",
    },
    duration: 35,
    videoUrl: null,
    thumbnailUrl: null,
  },
];

export function getMockShotById(id: string) {
  return mockShots.find((shot) => shot.id === id);
}
