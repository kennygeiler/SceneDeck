/**
 * Token-bucket rate limiter for Gemini API calls (AC-07).
 * Keep MAX_TOKENS / REFILL_INTERVAL_MS in sync with ../../src/lib/rate-limiter.ts.
 */

const MAX_TOKENS = 130;
const REFILL_INTERVAL_MS = 60_000;

let tokens = MAX_TOKENS;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    tokens = MAX_TOKENS;
    lastRefill = now;
  } else {
    const newTokens = Math.floor((elapsed / REFILL_INTERVAL_MS) * MAX_TOKENS);
    tokens = Math.min(MAX_TOKENS, tokens + newTokens);
    lastRefill = now;
  }
}

export async function acquireToken(): Promise<void> {
  refill();
  if (tokens > 0) {
    tokens--;
    return;
  }

  const waitMs = Math.ceil(REFILL_INTERVAL_MS / MAX_TOKENS);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  refill();
  tokens--;
}
