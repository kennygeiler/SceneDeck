export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import {
  FRAMINGS,
  DEPTH_TYPES,
  BLOCKING_TYPES,
  SYMMETRY_TYPES,
  DOMINANT_LINES,
  LIGHTING_DIRECTIONS,
  LIGHTING_QUALITIES,
  COLOR_TEMPERATURES,
  SHOT_SIZES,
  VERTICAL_ANGLES,
  HORIZONTAL_ANGLES,
  DURATION_CATEGORIES,
} from "@/lib/taxonomy";
import { validateApiKey } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  return Response.json({
    framings: Object.entries(FRAMINGS).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    depthTypes: Object.entries(DEPTH_TYPES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    blockingTypes: Object.entries(BLOCKING_TYPES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    symmetryTypes: Object.entries(SYMMETRY_TYPES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    dominantLines: Object.entries(DOMINANT_LINES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    lightingDirections: Object.entries(LIGHTING_DIRECTIONS).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    lightingQualities: Object.entries(LIGHTING_QUALITIES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    colorTemperatures: Object.entries(COLOR_TEMPERATURES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    shotSizes: Object.entries(SHOT_SIZES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    verticalAngles: Object.entries(VERTICAL_ANGLES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    horizontalAngles: Object.entries(HORIZONTAL_ANGLES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
    durationCategories: Object.entries(DURATION_CATEGORIES).map(([key, val]) => ({
      slug: key,
      displayName: val.displayName,
    })),
  });
}
