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

// Holds presses that arrive before the ask controller exists (permission prompts at first launch) and hands them
// over once it does; claiming them earlier would mark them handled with nobody to act on them (issue #3).
export class PressGate {
  private held: number | null = null;
  private open = false;
  private readonly tracker = new PressTracker();

  constructor(private readonly handle: () => void) {}

  offer(pressedAt: number, now: number): void {
    if (!this.open) {
      this.held = Math.max(this.held ?? 0, pressedAt);
      return;
    }
    if (this.tracker.claim(pressedAt, now) === "new") this.handle();
  }

  /** The controller is ready: handle the newest press that waited for it, if it is not stale. */
  openGate(now: number): void {
    this.open = true;
    const held = this.held;
    this.held = null;
    if (held !== null) this.offer(held, now);
  }
}
