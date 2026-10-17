import { CLIP_STALL_MS, ClipPlayer, ClipStatus, playClips } from "../playback";

type Fake = ClipPlayer & { url: string; emit(status: Partial<ClipStatus>): void; removed: boolean };

function setup() {
  const players: Fake[] = [];
  let slept = 0;
  const deps = {
    create: (url: string): ClipPlayer => {
      let listener: ((s: ClipStatus) => void) | null = null;
      const p: Fake = {
        url,
        removed: false,
        play: () => undefined,
        pause: () => undefined,
        remove: () => { p.removed = true; },
        addListener: (_e, cb) => { listener = cb; return { remove: () => { listener = null; } }; },
        emit: (s) => listener?.({ didJustFinish: false, error: null, currentTime: 0, ...s }),
      };
      players.push(p);
      return p;
    },
    sleep: async (ms: number) => { slept += ms; await Promise.resolve(); },
  };
  return { players, deps, slept: () => slept, stopRef: { stop: null as (() => void) | null } };
}

const flush = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

test("plays clips in order", async () => {
  const s = setup();
  const done = playClips(["u1", "u2"], s.deps, s.stopRef);
  await flush();
  s.players[0].emit({ didJustFinish: true });
  await flush();
  s.players[1].emit({ didJustFinish: true });
  await done;
  expect(s.players.map((p) => p.url)).toEqual(["u1", "u2"]);
  expect(s.players.every((p) => p.removed)).toBe(true);
});

test("a player error rejects instead of hanging", async () => {
  const s = setup();
  const done = playClips(["u1"], s.deps, s.stopRef);
  await flush();
  s.players[0].emit({ error: "Source error" });
  await expect(done).rejects.toThrow("Source error");
  expect(s.players[0].removed).toBe(true);
});

test("a clip that never progresses is given up", async () => {
  const s = setup();
  await expect(playClips(["u1"], s.deps, s.stopRef)).rejects.toThrow("stalled");
  expect(s.slept()).toBeGreaterThanOrEqual(CLIP_STALL_MS);
});

test("progress keeps the watchdog quiet", async () => {
  const s = setup();
  let t = 0;
  const deps = {
    ...s.deps,
    sleep: async (ms: number) => {
      await s.deps.sleep(ms);
      t += ms / 1000;
      if (t < 30) s.players[0].emit({ currentTime: t });
      else s.players[0].emit({ didJustFinish: true });
    },
  };
  await expect(playClips(["u1"], deps, s.stopRef)).resolves.toBeUndefined();
});

test("stop ends playback without starting the next clip", async () => {
  const s = setup();
  const done = playClips(["u1", "u2"], s.deps, s.stopRef);
  await flush();
  s.stopRef.stop?.();
  await done;
  expect(s.players[0].removed).toBe(true);
  expect(s.players).toHaveLength(1);
});

test("a clip that ends after another one started does not take away the newer one's stop", async () => {
  const s = setup();
  // The stall watchdog is not under test here: its sleep never ends.
  const deps = { ...s.deps, sleep: () => new Promise<void>(() => undefined) };
  const older = playClips(["old"], deps, s.stopRef);
  await flush();
  const newer = playClips(["new"], deps, s.stopRef);
  await flush();
  const newerStop = s.stopRef.stop;
  s.players[0].emit({ didJustFinish: true });
  await older;
  expect(s.stopRef.stop).toBe(newerStop);
  expect(s.stopRef.stop).not.toBeNull();
  s.stopRef.stop?.();
  await newer;
  expect(s.players[1].removed).toBe(true);
});
