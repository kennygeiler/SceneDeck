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
    const shotSize = getParamValue(request.nextUrl.searchParams, "shotSize");
    const query =
      getParamValue(request.nextUrl.searchParams, "query") ??
      getParamValue(request.nextUrl.searchParams, "q");

    const filters = {
      movementType,
      director,
      shotSize,
    };

    const shots = query
      ? filterShotsCollection(await searchShots(query), filters)
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
