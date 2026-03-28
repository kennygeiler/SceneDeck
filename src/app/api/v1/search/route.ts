export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { searchShots } from "@/db/queries";
import { retrieve } from "@/lib/rag-retrieval";
import { validateApiKey } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth.valid) {
    return Response.json({ error: auth.error }, { status: 401 });
  }

  try {
    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (!query) {
      return Response.json(
        { error: "q parameter is required" },
        { status: 400 },
      );
    }

    const mode = request.nextUrl.searchParams.get("mode") ?? "shots";

    if (mode === "rag") {
      // Full RAG retrieval: corpus + shots + scenes
      const result = await retrieve(query, {
        openAiApiKey: process.env.OPENAI_API_KEY,
      });
      return Response.json({
        queryType: result.queryType,
        corpusChunks: result.corpusChunks,
        shots: result.shots,
        scenes: result.scenes,
      });
    }

    // Default: shot-level semantic search
    const shots = await searchShots(query, {
      openAiApiKey: process.env.OPENAI_API_KEY,
    });

    return Response.json({
      data: shots.slice(0, 20).map((s) => ({
        id: s.id,
        filmTitle: s.film.title,
        director: s.film.director,
        framing: s.metadata.framing,
        shotSize: s.metadata.shotSize,
        duration: s.duration,
        description: s.semantic?.description ?? null,
        relevance: s.relevance,
        thumbnailUrl: s.thumbnailUrl,
      })),
      total: shots.length,
    });
  } catch {
    return Response.json(
      { error: "Search failed" },
      { status: 500 },
    );
  }
}
