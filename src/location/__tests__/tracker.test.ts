import { Fix } from "../heading";
import { MAX_CURRENT_AGE_MS, PositionSource, PositionTracker } from "../tracker";

const NOW = 1_800_000_000_000;
const fix = (timestamp: number): Fix => ({ latitude: 35.68, longitude: 139.76, timestamp, accuracy: 5 });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function source(options: { lastKnown?: Fix | null } = {}) {
  let resolveWatch!: (s: { remove(): void }) => void;
  const watchers: ((f: Fix) => void)[] = [];
  const removed: string[] = [];
  const src: PositionSource = {
    now: () => NOW,
    lastKnown: async () => options.lastKnown ?? null,
    watch: (cb) => {
      watchers.push(cb);
      return new Promise((resolve) => { resolveWatch = resolve; });
    },
  };
  return {
    src,
    removed,
    deliverWatch: (name = "w") => resolveWatch({ remove: () => removed.push(name) }),
    // Delivers a fix to the newest watch, or to the given one (0 = the first begin()).
    emit: (f: Fix, watch = watchers.length - 1) => watchers[watch](f),
  };
}

test("a watch that arrives after end() is removed at once", async () => {
  const s = source();
  const t = new PositionTracker(s.src);
  t.begin();
  t.end();
  s.deliverWatch("late");
  await flush();
  expect(s.removed).toEqual(["late"]);
});

test("end() removes a watch that is already set up", async () => {
  const s = source();
  const t = new PositionTracker(s.src);
  t.begin();
  s.deliverWatch("w");
  await flush();
  t.end();
  expect(s.removed).toEqual(["w"]);
});

test("fixes from an earlier begin() are not mixed in", async () => {
  const s = source();
  const t = new PositionTracker(s.src);
  t.begin();
  t.end();
  t.begin();
  s.emit(fix(NOW - 1_000), 0);
  s.emit(fix(NOW - 500), 1);
  expect(t.end().fixes).toEqual([fix(NOW - 500)]);
});

test("a stale last-known point is not the current position", async () => {
  const s = source({ lastKnown: fix(NOW - MAX_CURRENT_AGE_MS - 1) });
  const t = new PositionTracker(s.src);
  t.begin();
  await flush();
  const { current, fixes } = t.end();
  expect(current).toBeNull();
  expect(fixes).toHaveLength(1);
});

test("the newest fresh fix is the current position", async () => {
  const s = source({ lastKnown: fix(NOW - 5_000) });
  const t = new PositionTracker(s.src);
  t.begin();
  await flush();
  s.emit(fix(NOW - 1_000));
  expect(t.end().current).toEqual(fix(NOW - 1_000));
});
