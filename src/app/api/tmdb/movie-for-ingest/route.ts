import { NextResponse } from "next/server";

import { fetchTmdbMovieIngestFields } from "@/lib/tmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.TMDB_API_KEY?.trim()) {
    return NextResponse.json({ error: "TMDB_API_KEY is not configured." }, { status: 503 });
  }

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid or missing id." }, { status: 400 });
  }

  const fields = await fetchTmdbMovieIngestFields(id);
  if (!fields) {
    return NextResponse.json({ error: "Movie not found or TMDB error." }, { status: 404 });
  }

  return NextResponse.json(fields);
}
