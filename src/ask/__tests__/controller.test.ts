import { ApiError, AskAccepted, AskBody, AskResult } from "../../api/client";
import { Settings } from "../../settings/store";
import { AskApi, AskController, Deps, RECORD_LIMIT_MS } from "../controller";
import { ConversationState } from "../conversation";
import { FlowState } from "../flow";

const MAPS = { packageName: "maps", label: "マップ" };
const SETTINGS: Settings = { userName: "rider01", returnEnabled: true, returnApp: MAPS, returnTiming: "sent", recentApps: [] };
const ACCEPTED: AskAccepted = { askId: "a1", conversationId: "c1", conversationExpiresAt: "2999-01-01T00:00:00.000Z" };
const done = (over: Partial<AskResult> = {}): AskResult => ({
  askId: "a1", status: "completed", transcript: "Q", answer: "愛鷹山です。", audio: [{ seq: 1, url: "https://audio/1.mp3" }], error: null, timings: {}, ...over,
});
const HERE = { latitude: 35.6812, longitude: 139.7671, timestamp: 100_000 };
const BEHIND = { latitude: 35.6806, longitude: 139.7671, timestamp: 90_000 };

type Options = {
  apiKey?: string | null;
  settings?: Settings;
  post?: () => Promise<AskAccepted>;
  results?: Array<AskResult | Error>;
  routeOk?: boolean;
  playError?: Error;
  stopAfterMs?: number | null;
  micAllowed?: boolean;
  sayGate?: Promise<void>;
};

function harness(options: Options = {}) {
  const log: string[] = [];
  const states: FlowState[] = [];
  const bodies: AskBody[] = [];
  let now = 0;
  const results = [...(options.results ?? [done()])];
  let controller!: AskController;
  const api: AskApi = {
    postAsk: async (body) => { bodies.push(body); log.push("post"); return options.post ? options.post() : ACCEPTED; },
    getAsk: async () => { log.push("get"); const r = results.shift() ?? done(); if (r instanceof Error) throw r; return r; },
  };
  const deps: Deps = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
      if (options.stopAfterMs != null && controller.state.phase === "recording" && now >= options.stopAfterMs) controller.stopRecording();
    },
    settings: () => options.settings ?? SETTINGS,
    apiKey: () => (options.apiKey === undefined ? "key" : options.apiKey),
    micAllowed: async () => options.micAllowed ?? true,
    api: () => api,
    conversation: new ConversationState(),
    route: { start: async (source) => { log.push(`route:${source}`); return options.routeOk ?? true; }, stop: async () => { log.push("route:stop"); } },
    recorder: { start: async () => { log.push("rec:start"); }, stop: async () => { log.push("rec:stop"); return "UENN"; }, cancel: async () => { log.push("rec:cancel"); } },
    location: { begin: () => { log.push("loc:begin"); }, end: () => ({ current: HERE, fixes: [BEHIND, HERE] }) },
    service: { start: () => { log.push("svc:start"); }, stop: () => { log.push("svc:stop"); } },
    nav: { returnTo: async (pkg) => { log.push(`return:${pkg}`); return true; } },
    cues: { start: () => log.push("cue:start"), sent: () => log.push("cue:sent"), waiting: () => log.push("cue:waiting"), failure: () => log.push("cue:failure") },
    player: { play: async (urls) => { log.push(`play:${urls.join(",")}`); if (options.playError) throw options.playError; }, stop: () => { log.push("play:stop"); } },
    speech: { say: async (text) => { log.push(`say:${text}`); if (options.sayGate) await options.sayGate; }, stop: () => { log.push("say:stop"); } },
    onState: (s) => { states.push(s); },
    log: () => undefined,
  };
  controller = new AskController(deps);
  return { controller, log, states, bodies, deps, now: () => now };
}

test("handsfree happy path returns to nav right after sending", async () => {
  const h = harness({ stopAfterMs: 3000 });
  await h.controller.run("handsfree");
  expect(h.log).toEqual([
    "svc:start", "loc:begin", "route:handsfree", "rec:start", "cue:start", "rec:stop", "route:stop",
    "post", "cue:sent", "return:maps", "get", "play:https://audio/1.mp3", "svc:stop",
  ]);
  expect(h.bodies[0]).toEqual({
    audio: "UENN",
    location: { latitude: 35.6812, longitude: 139.7671 },
    headingSample: { latitude: 35.6806, longitude: 139.7671, at: new Date(90_000).toISOString() },
    conversationId: null,
  });
  expect(h.controller.state.phase).toBe("idle");
  expect(h.states.map((s) => s.phase)).toEqual(["recording", "sending", "waiting", "speaking", "idle"]);
});

test("screen questions never return to nav", async () => {
  const h = harness({ stopAfterMs: 1000 });
  await h.controller.run("screen");
  expect(h.log).toContain("route:screen");
  expect(h.log.some((l) => l.startsWith("return:"))).toBe(false);
});

test("return after the answer is spoken when chosen", async () => {
  const h = harness({ stopAfterMs: 1000, settings: { ...SETTINGS, returnTiming: "spoken" } });
  await h.controller.run("handsfree");
  expect(h.log.indexOf("return:maps")).toBeGreaterThan(h.log.indexOf("play:https://audio/1.mp3"));
});

test("recording stops by itself at the limit", async () => {
  const h = harness({ stopAfterMs: null });
  await h.controller.run("handsfree");
  expect(h.log).toContain("post");
  expect(h.now()).toBeGreaterThanOrEqual(RECORD_LIMIT_MS);
});

test("conversation id is reused on the next question", async () => {
  const h = harness({ stopAfterMs: 1000 });
  await h.controller.run("handsfree");
  await h.controller.run("handsfree");
  expect(h.bodies[1].conversationId).toBe("c1");
  h.controller.resetConversation();
  await h.controller.run("handsfree");
  expect(h.bodies[2].conversationId).toBeNull();
});

test("phone mic is flagged when the intercom route fails", async () => {
  const h = harness({ stopAfterMs: 1000, routeOk: false });
  await h.controller.run("handsfree");
  expect(h.states.some((s) => s.phase === "recording" && s.phoneMic)).toBe(true);
  expect(h.log).toContain("post");
});

test("no key fails with a spoken message and no recording", async () => {
  const h = harness({ apiKey: null });
  await h.controller.run("handsfree");
  expect(h.log).toEqual(["cue:failure", "say:接続キーを確かめてください。", "return:maps"]);
});

test("network failure on send", async () => {
  const h = harness({ stopAfterMs: 1000, post: async () => { throw new ApiError("network"); } });
  await h.controller.run("handsfree");
  expect(h.log).toContain("say:通信できないため、質問できませんでした。");
  expect(h.log).toContain("return:maps");
  expect(h.log).not.toContain("get");
});

test("server failure is spoken", async () => {
  const h = harness({ stopAfterMs: 1000, results: [done({ status: "failed", error: "no_speech", answer: null, audio: [] })] });
  await h.controller.run("handsfree");
  expect(h.log).toContain("say:聞き取れませんでした。もう一度お話しください。");
});

test("test_tts_failed_reads_answer_with_device_voice", async () => {
  const h = harness({ stopAfterMs: 1000, results: [done({ status: "failed", error: "tts_failed", audio: [] })] });
  await h.controller.run("handsfree");
  expect(h.log).toContain("say:愛鷹山です。");
  expect(h.log).not.toContain("cue:failure");
});

test("test_player_error_falls_back_to_device_voice", async () => {
  const h = harness({ stopAfterMs: 1000, playError: new Error("decode") });
  await h.controller.run("handsfree");
  expect(h.log).toContain("say:愛鷹山です。");
});

test("timeout after two minutes of processing", async () => {
  const processing = Array.from({ length: 200 }, () => done({ status: "processing" }));
  const h = harness({ stopAfterMs: 1000, results: processing });
  await h.controller.run("handsfree");
  expect(h.log).toContain("say:時間切れです。もう一度お話しください。");
  expect(h.log.filter((l) => l === "cue:waiting").length).toBeGreaterThan(10);
});

test("test_press_while_waiting_says_busy", async () => {
  const h = harness({ stopAfterMs: 1000, results: [done({ status: "processing" }), done()] });
  const running = h.controller.run("handsfree");
  while (h.controller.state.phase !== "waiting") await Promise.resolve();
  h.controller.press();
  await running;
  expect(h.log).toContain("say:いま応答中です。少し待ってからもう一度お話しください。");
  expect(h.log.filter((l) => l === "rec:start")).toHaveLength(1);
});

test("second press stops the recording", async () => {
  const h = harness({ stopAfterMs: null });
  const running = h.controller.run("handsfree");
  while (h.controller.state.phase !== "recording") await Promise.resolve();
  h.controller.press();
  await running;
  expect(h.now()).toBeLessThan(RECORD_LIMIT_MS);
});

test("cancel while recording discards the audio", async () => {
  const h = harness({ stopAfterMs: null });
  const running = h.controller.run("screen");
  while (!h.log.includes("rec:start")) await Promise.resolve();
  h.controller.cancel();
  await running;
  expect(h.log).toContain("rec:cancel");
  expect(h.log).not.toContain("post");
  expect(h.controller.state.phase).toBe("idle");
});

test("cancel while waiting stops polling quietly", async () => {
  const processing = Array.from({ length: 50 }, () => done({ status: "processing" }));
  const h = harness({ stopAfterMs: 1000, results: processing });
  const running = h.controller.run("screen");
  while (h.controller.state.phase !== "waiting") await Promise.resolve();
  h.controller.cancel();
  await running;
  expect(h.log).not.toContain("cue:failure");
  expect(h.controller.state.phase).toBe("idle");
});

test("test_new_run_during_failed_screen_is_not_reset", async () => {
  let failPost = true;
  const h = harness({ stopAfterMs: 1000, post: async () => { if (failPost) throw new ApiError("network"); return ACCEPTED; } });
  const phase = () => h.controller.state.phase;
  const first = h.controller.run("screen");
  while (phase() !== "failed") await Promise.resolve();
  failPost = false;
  const secondStart = h.log.length;
  const second = h.controller.run("screen");
  await Promise.all([first, second]);
  const after = h.log.slice(secondStart);
  expect(after).toContain("play:https://audio/1.mp3");
  // The first run's cleanup must not stop the service the second run is using.
  expect(after.slice(0, after.indexOf("play:https://audio/1.mp3"))).not.toContain("svc:stop");
  expect(phase()).toBe("idle");
});

test("cancel clears the screen and stops the service at once", async () => {
  const h = harness({ stopAfterMs: 1000, post: () => new Promise<AskAccepted>(() => undefined) });
  void h.controller.run("screen");
  while (h.controller.state.phase !== "sending") await Promise.resolve();
  h.controller.cancel();
  expect(h.controller.state.phase).toBe("idle");
  expect(h.log).toContain("svc:stop");
});

test("an ask cancelled while sending plays no cue and does not return", async () => {
  let accept!: (a: AskAccepted) => void;
  const h = harness({ stopAfterMs: 1000, post: () => new Promise<AskAccepted>((r) => { accept = r; }) });
  const running = h.controller.run("handsfree");
  while (h.controller.state.phase !== "sending") await Promise.resolve();
  while (!accept) await Promise.resolve();
  h.controller.cancel();
  accept(ACCEPTED);
  await running;
  expect(h.log).not.toContain("cue:sent");
  expect(h.log.some((l) => l.startsWith("return:"))).toBe(false);
  expect(h.log).not.toContain("get");
});

test("a busy press goes back to the nav app after the message", async () => {
  const h = harness({ stopAfterMs: 1000, results: [done({ status: "processing" }), done()] });
  const running = h.controller.run("handsfree");
  while (h.controller.state.phase !== "waiting") await Promise.resolve();
  h.controller.press();
  await running;
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  expect(h.log.filter((l) => l === "return:maps")).toHaveLength(2);
  expect(h.log.lastIndexOf("return:maps")).toBeGreaterThan(h.log.indexOf("say:いま応答中です。少し待ってからもう一度お話しください。"));
});

test("a denied microphone fails without starting the service", async () => {
  const h = harness({ micAllowed: false });
  await h.controller.run("handsfree");
  expect(h.log).toContain("say:録音できませんでした。");
  expect(h.log).not.toContain("svc:start");
});

test("an old failure does not act on the next ask", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let failPost = true;
  const h = harness({ stopAfterMs: 1000, sayGate: gate, post: async () => { if (failPost) throw new ApiError("network"); return ACCEPTED; } });
  const phase = () => h.controller.state.phase;
  const first = h.controller.run("screen");
  while (phase() !== "failed") await Promise.resolve();
  failPost = false;
  h.controller.press();
  while (phase() !== "recording") await Promise.resolve();
  release();
  await first;
  while (phase() !== "idle") await Promise.resolve();
  const returns = h.log.map((l, i) => [l, i] as const).filter(([l]) => l === "return:maps");
  expect(returns).toHaveLength(1);
  expect(returns[0][1]).toBeGreaterThan(h.log.lastIndexOf("post"));
});
