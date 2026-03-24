"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseAgentMessage } from "@/components/agent/message-cards";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ToolCall {
  name: string;
  args: unknown;
  result: unknown;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
}

/* ------------------------------------------------------------------ */
/*  Suggested prompts                                                  */
/* ------------------------------------------------------------------ */

const SUGGESTED_PROMPTS = [
  "What can you tell me about the films in the archive?",
  "Compare Kubrick and Chazelle\u2019s camera techniques",
  "What does a high static shot percentage mean?",
  "I want to create tension \u2014 what techniques should I use?",
] as const;

/* ------------------------------------------------------------------ */
/*  Simple markdown renderer                                           */
/* ------------------------------------------------------------------ */

function renderMarkdown(text: string) {
  // Split into lines, apply basic markdown transforms, then run
  // parseAgentMessage on each text segment for inline badges.
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul
          key={`list-${elements.length}`}
          className="my-2 list-inside list-disc space-y-1 pl-2 text-[var(--color-text-secondary)]"
        >
          {listItems.map((item, i) => (
            <li key={i}>{parseAgentMessage(applyInlineFormatting(item))}</li>
          ))}
        </ul>,
      );
      listItems = [];
    }
    inList = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Unordered list item
    if (/^[\-\*]\s+/.test(line)) {
      inList = true;
      listItems.push(line.replace(/^[\-\*]\s+/, ""));
      continue;
    }

    // Numbered list item
    if (/^\d+\.\s+/.test(line)) {
      inList = true;
      listItems.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }

    // If we were in a list and hit a non-list line, flush
    if (inList) flushList();

    // Heading
    if (/^###\s+/.test(line)) {
      elements.push(
        <h4
          key={`h-${i}`}
          className="mt-4 mb-1 text-sm font-semibold text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {parseAgentMessage(line.replace(/^###\s+/, ""))}
        </h4>,
      );
      continue;
    }
    if (/^##\s+/.test(line)) {
      elements.push(
        <h3
          key={`h-${i}`}
          className="mt-4 mb-1 text-base font-semibold text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {parseAgentMessage(line.replace(/^##\s+/, ""))}
        </h3>,
      );
      continue;
    }
    if (/^#\s+/.test(line)) {
      elements.push(
        <h2
          key={`h-${i}`}
          className="mt-4 mb-2 text-lg font-semibold text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {parseAgentMessage(line.replace(/^#\s+/, ""))}
        </h2>,
      );
      continue;
    }

    // Code block delimiter — skip (we render inline code only)
    if (/^```/.test(line)) continue;

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Regular paragraph
    elements.push(
      <p
        key={`p-${i}`}
        className="text-sm leading-7 text-[var(--color-text-secondary)]"
      >
        {parseAgentMessage(applyInlineFormatting(line))}
      </p>,
    );
  }

  // Flush any trailing list
  if (inList) flushList();

  return elements;
}

/**
 * Apply bold / italic / inline code markdown.
 * Returns the string with HTML-like markers that React can render.
 * (For simplicity we return the string and let parseAgentMessage handle React nodes.)
 */
function applyInlineFormatting(text: string): string {
  // We keep it simple — the inline badges handle React elements,
  // and we apply basic bold/italic via CSS later. For now, strip
  // markdown bold markers and let the text pass through.
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}

/* ------------------------------------------------------------------ */
/*  ChatInterface component                                            */
/* ------------------------------------------------------------------ */

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMessage: Message = { role: "user", content: trimmed };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsStreaming(true);

      // Prepare API payload — convert to user/model format
      const apiMessages = newMessages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        content: m.content,
      }));

      // Add a placeholder assistant message
      const assistantIndex = newMessages.length;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", toolCalls: [] },
      ]);

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);

              if (event.type === "token") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const msg = updated[assistantIndex];
                  if (msg) {
                    updated[assistantIndex] = {
                      ...msg,
                      content: msg.content + event.text,
                    };
                  }
                  return updated;
                });
              } else if (event.type === "tool_call") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const msg = updated[assistantIndex];
                  if (msg) {
                    updated[assistantIndex] = {
                      ...msg,
                      toolCalls: [
                        ...(msg.toolCalls ?? []),
                        { name: event.name, args: event.args, result: null },
                      ],
                    };
                  }
                  return updated;
                });
              } else if (event.type === "tool_result") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const msg = updated[assistantIndex];
                  if (msg?.toolCalls) {
                    const calls = [...msg.toolCalls];
                    const lastCall = calls.findLast(
                      (tc) => tc.name === event.name,
                    );
                    if (lastCall) lastCall.result = event.data;
                    updated[assistantIndex] = { ...msg, toolCalls: calls };
                  }
                  return updated;
                });
              } else if (event.type === "error") {
                setMessages((prev) => {
                  const updated = [...prev];
                  const msg = updated[assistantIndex];
                  if (msg) {
                    updated[assistantIndex] = {
                      ...msg,
                      content:
                        msg.content || `An error occurred: ${event.text}`,
                    };
                  }
                  return updated;
                });
              }
              // "done" — just stop
            } catch {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      } catch (err) {
        console.error("Chat stream error:", err);
        setMessages((prev) => {
          const updated = [...prev];
          const msg = updated[assistantIndex];
          if (msg && !msg.content) {
            updated[assistantIndex] = {
              ...msg,
              content: "Failed to connect to the agent. Please try again.",
            };
          }
          return updated;
        });
      } finally {
        setIsStreaming(false);
      }
    },
    [messages, isStreaming],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      {/* Scrollable message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {isEmpty ? (
          /* ---- Empty state ---- */
          <div className="flex h-full flex-col items-center justify-center gap-8 py-20">
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]">
                Conversational interface
              </p>
              <h1
                className="mt-3 text-4xl font-semibold tracking-[var(--letter-spacing-snug)] text-[var(--color-text-primary)] sm:text-5xl"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Agent{" "}
                <span className="laser-text">MetroVision</span>
              </h1>
              <p className="mt-4 max-w-md text-base leading-8 text-[var(--color-text-secondary)]">
                Cinematography intelligence grounded in real film data
              </p>
            </div>

            <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-[var(--radius-lg)] border px-4 py-3 text-left text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]"
                  style={{
                    borderColor:
                      "color-mix(in oklch, var(--color-border-default) 60%, transparent)",
                    backgroundColor:
                      "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ---- Messages ---- */
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((msg, i) => (
              <div key={i}>
                {msg.role === "user" ? (
                  /* User message */
                  <div className="flex justify-end">
                    <div
                      className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 text-sm leading-7 text-[var(--color-text-primary)]"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, var(--color-accent-base) 14%, transparent)",
                        border:
                          "1px solid color-mix(in oklch, var(--color-accent-base) 24%, transparent)",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant message */
                  <div className="flex justify-start">
                    <div className="max-w-[90%]">
                      {/* Tool call indicators */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && (
                        <div className="mb-2 flex flex-col gap-1">
                          {msg.toolCalls.map((tc, j) => (
                            <div
                              key={j}
                              className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[var(--letter-spacing-wide)] text-[var(--color-text-tertiary)]"
                            >
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{
                                  backgroundColor: tc.result
                                    ? "var(--color-accent-base)"
                                    : "var(--color-text-tertiary)",
                                }}
                                aria-hidden="true"
                              />
                              {tc.result
                                ? `Queried: ${tc.name}`
                                : `Querying archive\u2026 ${tc.name}`}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message content */}
                      <div
                        className="rounded-2xl rounded-bl-md px-4 py-3"
                        style={{
                          backgroundColor:
                            "color-mix(in oklch, var(--color-surface-secondary) 50%, transparent)",
                          border:
                            "1px solid color-mix(in oklch, var(--color-border-default) 50%, transparent)",
                        }}
                      >
                        {msg.content ? (
                          renderMarkdown(msg.content)
                        ) : isStreaming && i === messages.length - 1 ? (
                          <span className="inline-block h-4 w-1 animate-pulse bg-[var(--color-text-tertiary)]" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom input bar */}
      <div
        className="shrink-0 border-t px-4 py-4"
        style={{
          borderColor: "var(--color-border-default)",
          backgroundColor: "var(--color-surface-primary)",
        }}
      >
        <div className="mx-auto flex max-w-3xl items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about cinematography..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-[var(--radius-lg)] border bg-transparent px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-tertiary)] disabled:opacity-50"
            style={{
              borderColor: "var(--color-border-default)",
              backgroundColor:
                "color-mix(in oklch, var(--color-surface-secondary) 40%, transparent)",
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isStreaming || !input.trim()}
            className="shrink-0 rounded-[var(--radius-lg)] px-5 py-3 text-sm font-medium transition-opacity disabled:opacity-40"
            style={{
              backgroundColor: "var(--color-accent-base)",
              color: "var(--color-surface-primary)",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
