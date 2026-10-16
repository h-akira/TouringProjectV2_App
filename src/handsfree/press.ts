// The same press can arrive twice (pending at launch and as an event); a press older than a minute is stale.
export const STALE_PRESS_MS = 60_000;

export class PressTracker {
  private lastHandled = 0;

  claim(pressedAt: number, now: number): "new" | "duplicate" | "stale" {
    if (pressedAt <= this.lastHandled) return "duplicate";
    if (now - pressedAt > STALE_PRESS_MS) return "stale";
    this.lastHandled = pressedAt;
    return "new";
  }
}
