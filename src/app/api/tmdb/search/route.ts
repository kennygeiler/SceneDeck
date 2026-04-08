import { NextResponse } from "next/server";

import { searchTmdbMovies } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tmdbConfigured(): boolean {
  return Boolean(process.env.TMDB_API_KEY?.trim());
}

export async function GET(request: Request) {
  if (!tmdbConfigured()) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured.", results: [] as [] },
      { status: 503 },
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchTmdbMovies(q, 12);
  return NextResponse.json({ results });
}
