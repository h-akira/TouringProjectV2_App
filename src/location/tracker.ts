// Collects position fixes while a question is recorded. A watch that is set up only after end() is removed at once,
// and a last-known point older than MAX_CURRENT_AGE_MS is not sent as the current position (issue #1).
import { Fix } from "./heading";

export const MAX_CURRENT_AGE_MS = 30_000;

export type Subscription = { remove(): void };
export type PositionSource = {
  now(): number;
  lastKnown(): Promise<Fix | null>;
  watch(onFix: (fix: Fix) => void): Promise<Subscription>;
};

export class PositionTracker {
  private fixes: Fix[] = [];
  private subscription: Subscription | null = null;
  // Bumped by begin() and end(); callbacks of an earlier generation are ignored.
  private generation = 0;

  constructor(private readonly source: PositionSource) {}

  begin(): void {
    this.subscription?.remove();
    this.subscription = null;
    this.fixes = [];
    const generation = ++this.generation;
    const add = (fix: Fix) => {
      if (generation === this.generation) this.fixes.push(fix);
    };
    void this.source.lastKnown().then((fix) => fix && add(fix)).catch(() => undefined);
    void this.source
      .watch(add)
      .then((subscription) => {
        if (generation === this.generation) this.subscription = subscription;
        else subscription.remove();
      })
      .catch(() => undefined);
  }

  end(): { current: Fix | null; fixes: Fix[] } {
    this.generation += 1;
    this.subscription?.remove();
    this.subscription = null;
    const fixes = [...this.fixes].sort((a, b) => a.timestamp - b.timestamp);
    this.fixes = [];
    const latest = fixes.length > 0 ? fixes[fixes.length - 1] : null;
    const current = latest && this.source.now() - latest.timestamp <= MAX_CURRENT_AGE_MS ? latest : null;
    return { current, fixes };
  }
}
