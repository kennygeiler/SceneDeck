export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { rejectIfLlmRouteGated } from "@/lib/llm-route-gate";
import { retrieve, formatRetrievalContext } from "@/lib/rag-retrieval";

const SYSTEM_PROMPT = `You are MetroVision, an expert cinematography analysis assistant. You have access to a database of classified film shots and a knowledge corpus of cinematography textbooks, research papers, and critical analysis.

When answering questions:
- Cite specific films, directors, scenes, and shots from the provided context
- Use precise cinematography terminology (movement types, shot sizes, angles)
- When comparing techniques across directors or films, ground your analysis in the data
- If the context doesn't contain relevant information, say so rather than guessing
- For shot recommendations, reference specific examples from the database

You serve two audiences:
1. Academic researchers studying directorial techniques scientifically
2. AI filmmakers who need actionable shot references for pre/post-production`;

export async function POST(request: NextRequest) {
  try {
    const gated = rejectIfLlmRouteGated(request);
    if (gated) return gated;

    const { query } = (await request.json()) as { query: string };

    if (!query?.trim()) {
      return Response.json({ error: "query is required" }, { status: 400 });
    }

    // Retrieve relevant context
    const retrieval = await retrieve(query, {
      openAiApiKey: process.env.OPENAI_API_KEY,
    });

    const context = formatRetrievalContext(retrieval);

    // Call foundation model with RAG context
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GOOGLE_API_KEY is not set" },
        { status: 500 },
      );
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              parts: [
                {
                  text: `Context from MetroVision database and knowledge corpus:\n\n${context}\n\n---\n\nUser query: ${query}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      },
    );

    if (!response.ok) {
      await response.text();
      return Response.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 502 },
      );
    }

    const result = await response.json();
    const text =
      result.candidates?.[0]?.content?.parts
        ?.map((p: Record<string, unknown>) => p.text)
        .join("") ?? "No response generated.";

    return Response.json({
      answer: text,
      retrieval: {
        queryType: retrieval.queryType,
        corpusChunksCount: retrieval.corpusChunks.length,
        shotsCount: retrieval.shots.length,
        scenesCount: retrieval.scenes.length,
        shots: retrieval.shots.slice(0, 5),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "RAG query failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
