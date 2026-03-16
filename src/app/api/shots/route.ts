import { NextRequest } from "next/server";

import {
  filterShotsCollection,
  getAllShots,
  searchShots,
} from "@/db/queries";

function getParamValue(
  searchParams: URLSearchParams,
  key: string,
) {
  return searchParams.get(key)?.trim() || undefined;
}

export async function GET(request: NextRequest) {
  try {
    const movementType = getParamValue(
      request.nextUrl.searchParams,
      "movementType",
    );
    const director = getParamValue(request.nextUrl.searchParams, "director");
    const filmTitle = getParamValue(request.nextUrl.searchParams, "filmTitle");
    const shotSize = getParamValue(request.nextUrl.searchParams, "shotSize");
    const query =
      getParamValue(request.nextUrl.searchParams, "query") ??
      getParamValue(request.nextUrl.searchParams, "q");

    const filters = {
      movementType,
      director,
      filmTitle,
      shotSize,
    };

    const shots = query
      ? filterShotsCollection(
          await searchShots(query, {
            openAiApiKey: process.env.OPENAI_API_KEY,
          }),
          filters,
        )
      : await getAllShots(filters);

    return Response.json(shots);
  } catch (error) {
    console.error("Failed to load shots.", error);

    return Response.json(
      { error: "Failed to load shots." },
      { status: 500 },
    );
  }
}
