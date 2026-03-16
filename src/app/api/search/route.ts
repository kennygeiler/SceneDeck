import { NextRequest } from "next/server";

import { searchShots } from "@/db/queries";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim();

    if (!query) {
      return Response.json([]);
    }

    const shots = await searchShots(query);

    return Response.json(shots);
  } catch (error) {
    console.error("Failed to search shots.", error);

    return Response.json(
      { error: "Failed to search shots." },
      { status: 500 },
    );
  }
}
