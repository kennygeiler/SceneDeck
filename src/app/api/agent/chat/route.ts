export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { AGENT_SYSTEM_PROMPT } from "@/lib/agent-system-prompt";
import { TOOL_DECLARATIONS, executeToolCall } from "@/lib/agent-tools";
import { rejectIfLlmRouteGated } from "@/lib/llm-route-gate";
import { acquireToken } from "@/lib/rate-limiter";
import { retrieve, formatRetrievalContext } from "@/lib/rag-retrieval";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
}

/**
 * Convert our chat messages to Gemini "contents" format.
 */
function toGeminiContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

/**
 * Call Gemini 2.5 Flash (non-streaming) with function calling support.
 */
async function callGemini(contents: Array<Record<string, unknown>>) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");

  await acquireToken();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: AGENT_SYSTEM_PROMPT }] },
    contents,
    tools: [{ function_declarations: TOOL_DECLARATIONS }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Extract text from Gemini response parts.
 */
function extractText(
  response: Record<string, unknown>,
): string | null {
  const candidates = response.candidates as
    | Array<{ content: { parts: Array<{ text?: string }> } }>
    | undefined;
  if (!candidates?.[0]?.content?.parts) return null;
  const textParts = candidates[0].content.parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text!);
  return textParts.length > 0 ? textParts.join("") : null;
}

/**
 * Extract function call from Gemini response parts.
 */
function extractFunctionCall(
  response: Record<string, unknown>,
): { name: string; args: Record<string, unknown> } | null {
  const candidates = response.candidates as
    | Array<{
        content: {
          parts: Array<{
            functionCall?: { name: string; args: Record<string, unknown> };
          }>;
        };
      }>
    | undefined;
  if (!candidates?.[0]?.content?.parts) return null;
  for (const part of candidates[0].content.parts) {
    if (part.functionCall) {
      return part.functionCall;
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const gated = rejectIfLlmRouteGated(request);
    if (gated) return gated;

    const { messages } = (await request.json()) as RequestBody;

    if (!messages || !Array.isArray(messages)) {
      return Response.json(
        { error: "messages array is required" },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        };

        try {
          // RAG: retrieve relevant context from knowledge corpus + film database
          const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
          let ragContext = "";
          if (lastUserMsg) {
            try {
              const retrieval = await retrieve(lastUserMsg.content, {
                openAiApiKey: process.env.OPENAI_API_KEY,
              });
              ragContext = formatRetrievalContext(retrieval);
              if (ragContext) {
                send({ type: "tool_call", name: "rag_retrieval", args: { query: lastUserMsg.content } });
                send({ type: "tool_result", name: "rag_retrieval", data: { chunksFound: retrieval.corpusChunks.length, shotsFound: retrieval.shots.length } });
              }
            } catch {
              // RAG failure is non-fatal — continue without corpus context
            }
          }

          // Inject RAG context into the conversation as a system-level grounding
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let contents: any[] = toGeminiContents(messages);
          if (ragContext) {
            contents = [
              { role: "user", parts: [{ text: `[MetroVision Knowledge Context]\n\n${ragContext}\n\n---\n\nPlease use this context to ground your response. Now respond to the conversation above.` }] },
              { role: "model", parts: [{ text: "I have the MetroVision knowledge context. I'll use it to ground my analysis." }] },
              ...contents,
            ];
          }
          let response = await callGemini(contents);

          // Function calling loop — keep going while Gemini returns tool calls
          let functionCall = extractFunctionCall(response);
          while (functionCall) {
            // Notify client of the tool call
            send({
              type: "tool_call",
              name: functionCall.name,
              args: functionCall.args,
            });

            // Execute the tool
            const toolResult = await executeToolCall(
              functionCall.name,
              functionCall.args,
            );

            // Notify client of the tool result
            send({
              type: "tool_result",
              name: functionCall.name,
              data: toolResult,
            });

            // Append the model's function call and our function response to the conversation
            contents = [
              ...contents,
              {
                role: "model",
                parts: [
                  {
                    functionCall: {
                      name: functionCall.name,
                      args: functionCall.args,
                    },
                  },
                ],
              },
              {
                role: "function",
                parts: [
                  {
                    functionResponse: {
                      name: functionCall.name,
                      response: { result: toolResult },
                    },
                  },
                ],
              },
            ];

            // Call Gemini again with the tool result
            response = await callGemini(contents);
            functionCall = extractFunctionCall(response);
          }

          // Stream the final text response character by character
          const text = extractText(response);
          if (text) {
            // Stream in small chunks for a typing effect
            const chunkSize = 3;
            for (let i = 0; i < text.length; i += chunkSize) {
              const chunk = text.slice(i, i + chunkSize);
              send({ type: "token", text: chunk });
              // Small delay for typing effect — yield to the event loop
              await new Promise((resolve) => setTimeout(resolve, 8));
            }
          }

          send({ type: "done" });
        } catch (err) {
          console.error("Agent chat error:", err);
          send({
            type: "error",
            text:
              err instanceof Error
                ? err.message
                : "An unexpected error occurred.",
          });
          send({ type: "done" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Agent chat route error:", err);
    return Response.json(
      { error: "Failed to process chat request." },
      { status: 500 },
    );
  }
}
