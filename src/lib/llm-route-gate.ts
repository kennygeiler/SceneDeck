/**
 * Optional production guard for routes that spend Gemini / OpenAI quota.
 * When METROVISION_LLM_GATE_SECRET is set, callers must send the same value in
 * header x-metrovision-llm-gate (constant-time compare). When unset, routes stay open (local/dev).
 */

import { timingSafeEqual } from "node:crypto";

const HEADER = "x-metrovision-llm-gate";

export function getLlmGateSecret(): string | undefined {
  const s = process.env.METROVISION_LLM_GATE_SECRET?.trim();
  return s || undefined;
}

/** Returns a 401 Response if gated and header mismatch; otherwise null. */
export function rejectIfLlmRouteGated(request: Request): Response | null {
  const secret = getLlmGateSecret();
  if (!secret) return null;

  const presented = request.headers.get(HEADER)?.trim() ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(presented);
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    return Response.json(
      {
        error:
          "LLM route gated: set header x-metrovision-llm-gate to match METROVISION_LLM_GATE_SECRET, or leave that env unset for open local access.",
      },
      { status: 401 },
    );
  }

  return null;
}
