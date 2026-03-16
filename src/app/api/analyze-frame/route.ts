import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-2.5-flash";
const BASE_PROMPT =
  'You are analyzing a frame from a film. List 3-5 key visual elements visible in this frame as short descriptive tags (2-4 words each). Consider: subjects, objects, setting, lighting, notable details. Return ONLY a JSON array of strings.';

type AnalyzeFrameRequest = {
  image?: unknown;
  context?: unknown;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

function parseRequestBody(body: AnalyzeFrameRequest) {
  const image = typeof body.image === "string" ? body.image.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (!image) {
    throw new Error("A base64 frame image is required.");
  }

  const match = image.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error("image must be a base64 data URL.");
  }

  return {
    mimeType: match[1],
    data: match[2],
    context,
  };
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Gemini did not return a JSON array of tags.");
  }

  const tags: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().replace(/\s+/g, " ").slice(0, 48);
    const dedupeKey = normalized.toLowerCase();
    if (!normalized || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    tags.push(normalized);

    if (tags.length === 5) {
      break;
    }
  }

  return tags;
}

function extractTags(payload: GeminiResponse) {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error(payload.error?.message || "Gemini returned an empty response.");
  }

  try {
    return normalizeTags(JSON.parse(text));
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");

    if (start === -1 || end === -1 || end < start) {
      throw new Error("Gemini response did not contain a JSON tag array.");
    }

    return normalizeTags(JSON.parse(text.slice(start, end + 1)));
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not configured.");
    }

    const payload = parseRequestBody(
      (await request.json()) as AnalyzeFrameRequest,
    );
    const prompt = payload.context
      ? `${BASE_PROMPT}\nContext: ${payload.context}`
      : BASE_PROMPT;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: payload.mimeType,
                    data: payload.data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const responsePayload = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      throw new Error(
        responsePayload.error?.message || "Gemini frame analysis failed.",
      );
    }

    return NextResponse.json({ tags: extractTags(responsePayload) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Frame analysis failed.";
    const status =
      message.includes("required") ||
      message.includes("must be") ||
      message.includes("configured")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
