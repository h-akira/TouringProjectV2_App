import { RECORD_LIMIT_MS } from "../controller";
import { TRIAL_MESSAGES, TrialController, TrialDeps, TrialState } from "../trial";

type Options = {
  routeOk?: boolean;
  micAllowed?: boolean;
  recorderError?: boolean;
  playError?: boolean;
  stopAfterMs?: number | null;
  holdPlayback?: boolean; // playback lasts until stopPlayback()
};

function harness(options: Options = {}) {
  const log: string[] = [];
  const states: TrialState[] = [];
  let now = 0;
  let trial!: TrialController;
  let endPlayback: (() => void) | null = null;
  const deps: TrialDeps = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
      if (options.stopAfterMs != null && now >= options.stopAfterMs) trial.stop();
    },
    micAllowed: async () => options.micAllowed ?? true,
    route: {
      start: async () => { log.push("route:start"); return options.routeOk ?? true; },
      stop: async () => { log.push("route:stop"); },
      inputDevice: () => ({ type: "bluetooth", name: "M1-S PRO" }),
    },
    recorder: {
      start: async () => { log.push("rec:start"); if (options.recorderError) throw new Error("busy"); },
      stop: async () => { log.push("rec:stop"); return "file:///trial.pcm"; },
      cancel: async () => { log.push("rec:cancel"); },
    },
    cueStart: () => log.push("cue:start"),
    play: async (uri) => {
      log.push(`play:${uri}`);
      if (options.playError) throw new Error("bad");
      if (options.holdPlayback) await new Promise<void>((resolve) => { endPlayback = resolve; });
    },
    stopPlayback: () => { log.push("play:stop"); endPlayback?.(); },
    discard: async (uri) => { log.push(`discard:${uri}`); },
    onState: (s) => states.push(s),
  };
  trial = new TrialController(deps);
  return { trial, log, states, now: () => now };
}

test("records, plays back at once and throws the file away", async () => {
  const h = harness({ stopAfterMs: 3000 });
  await h.trial.start();
  expect(h.log).toEqual(["route:start", "rec:start", "cue:start", "rec:stop", "route:stop", "play:file:///trial.pcm", "discard:file:///trial.pcm"]);
  expect(h.states.map((s) => s.phase)).toEqual(["recording", "recording", "playing", "idle"]);
  expect(h.trial.state).toEqual({ phase: "idle", phoneMic: false, device: { type: "bluetooth", name: "M1-S PRO" }, error: null });
});

test("stops by itself at the question limit", async () => {
  const h = harness({ stopAfterMs: null });
  await h.trial.start();
  expect(h.now()).toBeGreaterThanOrEqual(RECORD_LIMIT_MS);
  expect(h.log).toContain("play:file:///trial.pcm");
});

test("shows that the phone microphone was used when the intercom route fails", async () => {
  const h = harness({ stopAfterMs: 1000, routeOk: false });
  await h.trial.start();
  expect(h.trial.state.phoneMic).toBe(true);
});

test("a denied microphone is said on screen and nothing is recorded", async () => {
  const h = harness({ micAllowed: false });
  await h.trial.start();
  expect(h.log).toEqual([]);
  expect(h.trial.state).toMatchObject({ phase: "idle", error: TRIAL_MESSAGES.mic });
});

test("a recorder that cannot start releases the route", async () => {
  const h = harness({ recorderError: true });
  await h.trial.start();
  expect(h.log).toEqual(["route:start", "rec:start", "route:stop"]);
  expect(h.trial.state).toMatchObject({ phase: "idle", error: TRIAL_MESSAGES.record });
});

test("a playback failure is said and the file is still discarded", async () => {
  const h = harness({ stopAfterMs: 1000, playError: true });
  await h.trial.start();
  expect(h.log).toContain("discard:file:///trial.pcm");
  expect(h.trial.state).toMatchObject({ phase: "idle", error: TRIAL_MESSAGES.play });
});

test("leaving the screen while recording cancels without playing", async () => {
  const h = harness({ stopAfterMs: null });
  const running = h.trial.start();
  while (h.trial.state.phase !== "recording" || !h.log.includes("cue:start")) await Promise.resolve();
  h.trial.cancel();
  await running;
  expect(h.log).toContain("rec:cancel");
  expect(h.log).toContain("route:stop");
  expect(h.log.some((l) => l.startsWith("play:file"))).toBe(false);
  expect(h.trial.state.phase).toBe("idle");
});

test("a second start while one runs is ignored", async () => {
  const h = harness({ stopAfterMs: 1000 });
  const first = h.trial.start();
  void h.trial.start();
  await first;
  expect(h.log.filter((l) => l === "rec:start")).toHaveLength(1);
});

test("stop during playback stops the playback", async () => {
  const h = harness({ stopAfterMs: 1000, holdPlayback: true });
  const running = h.trial.start();
  while (h.trial.state.phase !== "playing") await Promise.resolve();
  h.trial.stop();
  await running;
  expect(h.log).toContain("play:stop");
  expect(h.trial.state.phase).toBe("idle");
});
