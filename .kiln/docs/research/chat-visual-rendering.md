# Chat Visual Rendering

**Status (2026-04):** The in-app Gemini chat route and UI were **removed** from the product codebase. This note remains as **industry background** if a future surface combines LLM output with D3 again.

## Finding

The dominant pattern for LLM-driven visual chat output in 2025 is the **tool-call-to-component** (Generative UI) pipeline: the LLM decides via function/tool calling which visualization to emit, returns a typed JSON payload as the tool result, and the client maps that result to a pre-registered React component. This is well-established by Vercel AI SDK 5+ and avoids the security hazards and fragility of having the LLM generate raw D3/JavaScript code at runtime.

There are three distinct rendering patterns each suited to different output types:

1. **Structured-data → registered component** ("Generative UI"): The LLM tool returns a typed data payload (e.g. `{ type: "rhythm_stream", shots: [...], filmId: "..." }`). The chat renderer switches on `type` and mounts the matching D3 component — e.g. `<RhythmStream shots={...} />` — inline in the message thread. This is the recommended path for MetroVision's six existing D3 charts. Vercel AI SDK 5's `message.parts` array with typed `tool-${toolName}` parts formalises this contract. The key insight from Vercel's docs: "By passing the tool results to React components, you can create a generative UI experience that's more engaging and adaptive to your needs."

2. **Hybrid streaming text + structured parts**: The server emits natural language prose tokens and a separate structured JSON part in the same stream. The client renders text progressively while also hydrating a visual component once its JSON part is complete. Scott Logic's 2024 research on LLM-generated D3 code notes: "LLMs could often succeed in the task, but only if they were provided with the right kind of help" — specifically, explicit data field descriptions in the prompt. This validates that the data-payload approach (LLM returns data, not D3 code) is far more reliable.

3. **LLM-generated code execution** (higher risk): The model emits actual D3/JS code which is eval'd or sandboxed client-side (see Renderify, Observable). This grants maximum flexibility but introduces XSS/eval risks, requires a sandbox runtime, and produces fragile output. Observable's 2024 study found AI tools for D3 code generation produce working code only ~40-60% of the time without iteration. Avoid for MetroVision.

For shotlists and reference decks, the same pattern applies: define a `shotlist` tool that returns `{ shots: ShotRef[], title: string, rationale: string }`, then render a `<InlineShotlist>` component in the message.

## Recommendation

If a chat-style surface returns again, pair a small set of "viz tools" (e.g. `render_rhythm_stream`, `render_shotlist`, `render_comparison_table`) with a client that mounts **pre-registered** D3/list components from typed tool results (no eval of model-generated code).

## Key Facts

- MetroVision **no longer ships** the former SSE chat route or client; **`POST /api/rag`** remains for retrieval-backed text answers.
- The six D3 components (`RhythmStream`, `HierarchySunburst`, `PacingHeatmap`, `ChordDiagram`, `CompositionScatter`, `DirectorRadar`) are all standalone `useRef + useEffect` components that accept typed props — they can be embedded in a chat message with no modifications.
- Vercel AI SDK 5 formalises the "tool result → React component" pattern via `message.parts` typed as `tool-${toolName}`, allowing conditional rendering in the message loop.
- `llm-ui` (React) provides a `useLLMOutput` hook and `LLMOutputComponent` pattern for matching structured blocks in LLM output streams and routing them to renderers.
- Vercel's `json-render` (open source, 2025) offers a declarative framework for AI-generated UI from JSON specs — useful if MetroVision wants LLM-composed layouts, not just LLM-selected charts.
- Scott Logic (2024): LLM-generated D3 code requires careful prompt engineering with field-level data descriptions and execution environment hints to succeed; structured-data-then-render is more reliable than code-generation.
- Observable's AI tools study (2024): Current LLMs produce working D3 code inconsistently; they are better at selecting and parameterising chart types than writing D3 from scratch.
- Inline token parsing (e.g. shot/film badges in prose) is a lighter-weight variant of the same Generative UI idea.
- For streaming visual props, the recommended approach is to complete the tool result JSON fully before mounting the D3 component (D3 operates on complete datasets; partial data causes render errors). Text and tool indicators can stream in parallel.
- Structured-data → component mapping is proven in the visualize dashboard (`src/components/visualize/*`).
- Vercel AI SDK 5 data-parts: "On the server, you can stream a data part by specifying your part type... On the client, you can then render this specific part."
- Recommended new tool types to add: `render_rhythm_stream` (filmId), `render_pacing_heatmap` (filmId), `render_director_radar` (directors[]), `render_shotlist` (shots[], title), `render_reference_deck` (shots[], theme), `render_comparison_table` (headers, rows).

## Sources

- `src/components/visualize/rhythm-stream.tsx` — exemplar D3 component (useRef + useEffect pattern)
- `src/components/visualize/viz-dashboard.tsx` — standalone D3 dashboard
- https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces — Vercel AI SDK generative UI docs
- https://vercel.com/blog/ai-sdk-5 — AI SDK 5 typed message parts
- https://blog.scottlogic.com/2024/03/26/generating-d3-code-with-llms.html — LLM D3 code generation reliability study
- https://observablehq.com/blog/ai-tools-llms-d3-code — Observable AI tools D3 effectiveness study
- https://github.com/vercel-labs/json-render — Vercel json-render generative UI framework
- https://llm-ui.com/ — llm-ui React library for structured LLM output rendering
- https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data — Vercel AI SDK data parts streaming
- https://medium.com/@enginoid/rendering-realtime-uis-with-streaming-structured-llm-completions-5d10479cefc0 — hybrid text + structured JSON streaming pattern
- https://blog.logrocket.com/react-llm-ui/ — llm-ui React integration patterns

## Confidence

0.88 — The tool-call-to-component pattern is strongly validated by multiple independent sources (Vercel AI SDK docs, scott logic research, Observable study, llm-ui library), the codebase already has ~70% of the required infrastructure, and the D3 component props interface is well understood from source review. Small deduction for lack of a published MetroVision-specific benchmark and the fact that Gemini (not OpenAI) has slightly less documented Generative UI tooling patterns.
