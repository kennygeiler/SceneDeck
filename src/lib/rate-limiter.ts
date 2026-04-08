/**
 * Token-bucket rate limiter for Gemini API calls (AC-07).
 * Target: 130 RPM (Tier 1 safe margin).
 * Serializes acquisition so concurrent ingest workers cannot drive the bucket negative (which stalled classification).
 */

const MAX_TOKENS = 130;
const REFILL_INTERVAL_MS = 60_000; // 1 minute

let tokens = MAX_TOKENS;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    tokens = MAX_TOKENS;
    lastRefill = now;
    return;
  }
  const newTokens = Math.floor((elapsed / REFILL_INTERVAL_MS) * MAX_TOKENS);
  if (newTokens > 0) {
    tokens = Math.min(MAX_TOKENS, tokens + newTokens);
    lastRefill = now;
  }
}

let gate: Promise<void> = Promise.resolve();

export async function acquireToken(): Promise<void> {
  const run = async (): Promise<void> => {
    for (;;) {
      refill();
      if (tokens > 0) {
        tokens--;
        return;
      }
      const waitMs = Math.ceil(REFILL_INTERVAL_MS / MAX_TOKENS);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  };

  const next = gate.then(run);
  gate = next.catch(() => {
    /* keep the queue alive if run ever rejects */
  });
  await next;
}
