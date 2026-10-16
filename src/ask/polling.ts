// Poll schedule from 07 UC-5: every 1 s for 10 s, then every 2 s, give up at 120 s.
import { ApiError, AskResult } from "../api/client";

export const POLL_FAST_MS = 1000;
export const POLL_SLOW_MS = 2000;
export const FAST_WINDOW_MS = 10_000;
export const POLL_TIMEOUT_MS = 120_000;
const FATAL = ["invalid_key", "bad_request", "not_found"];

export function nextDelay(elapsedMs: number): number {
  return elapsedMs < FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS;
}

type Deps = { sleep: (ms: number) => Promise<void>; now: () => number; isCancelled: () => boolean };

export async function pollUntilDone(get: () => Promise<AskResult>, deps: Deps): Promise<AskResult | "timeout" | "cancelled"> {
  const startedAt = deps.now();
  for (;;) {
    const elapsed = deps.now() - startedAt;
    if (elapsed >= POLL_TIMEOUT_MS) return "timeout";
    await deps.sleep(nextDelay(elapsed));
    if (deps.isCancelled()) return "cancelled";
    try {
      const result = await get();
      if (result.status !== "processing") return result;
    } catch (error) {
      if (error instanceof ApiError && FATAL.includes(error.kind)) throw error;
    }
  }
}
