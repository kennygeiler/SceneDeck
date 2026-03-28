export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { getAllFilms } from "@/db/queries";
import { validateApiKey } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  try {
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 20)));

    const films = await getAllFilms();
    const start = (page - 1) * limit;
    const paginated = films.slice(start, start + limit);

    return Response.json({
      data: paginated,
      pagination: {
        page,
        limit,
        total: films.length,
        totalPages: Math.ceil(films.length / limit),
      },
    });
  } catch {
    return Response.json(
      { error: "Failed to fetch films" },
      { status: 500 },
    );
  }
}
