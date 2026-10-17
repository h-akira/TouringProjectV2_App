import { BUSY_MESSAGE, failureFromServer, spokenMessage } from "../failures";
import { FlowState, IDLE, isBusy, reduce, shouldReturnNow } from "../flow";
import { Settings } from "../../settings/store";

const MAPS = { packageName: "maps", label: "マップ" };
const SETTINGS: Settings = { userName: "rider01", returnEnabled: true, returnApp: MAPS, returnTiming: "sent", recentApps: [], answerVolumeDb: 6 };

function run(events: Parameters<typeof reduce>[1][]): FlowState {
  return events.reduce(reduce, IDLE);
}

test("happy path", () => {
  const s = run([
    { type: "start", source: "handsfree", now: 1 },
    { type: "stopRecording", now: 2 },
    { type: "sent", askId: "a", now: 3 },
    { type: "answered", answer: "A", now: 4 },
  ]);
  expect(s).toMatchObject({ phase: "speaking", source: "handsfree", askId: "a", answer: "A", phaseStartedAt: 4 });
  expect(reduce(s, { type: "spoken", now: 5 })).toEqual(IDLE);
});

test("out of order events are ignored", () => {
  expect(reduce(IDLE, { type: "sent", askId: "a", now: 1 })).toEqual(IDLE);
  const recording = run([{ type: "start", source: "screen", now: 1 }]);
  expect(reduce(recording, { type: "start", source: "handsfree", now: 2 })).toBe(recording);
  expect(reduce(recording, { type: "answered", answer: "A", now: 2 })).toBe(recording);
});

test("phone mic flag only while recording", () => {
  const recording = run([{ type: "start", source: "handsfree", now: 1 }]);
  expect(reduce(recording, { type: "phoneMic", now: 2 }).phoneMic).toBe(true);
  expect(reduce(IDLE, { type: "phoneMic", now: 2 }).phoneMic).toBe(false);
});

test("failure and a new start after it", () => {
  const failed = run([{ type: "start", source: "screen", now: 1 }, { type: "fail", reason: "network", now: 2 }]);
  expect(failed).toMatchObject({ phase: "failed", failure: "network" });
  expect(isBusy(failed)).toBe(false);
  expect(reduce(failed, { type: "start", source: "handsfree", now: 3 })).toMatchObject({ phase: "recording", failure: null, source: "handsfree" });
});

test("busy phases", () => {
  expect(isBusy(IDLE)).toBe(false);
  expect(isBusy(run([{ type: "start", source: "screen", now: 1 }]))).toBe(true);
});

test("return only for handsfree at the chosen moment", () => {
  expect(shouldReturnNow("handsfree", SETTINGS, "sent")).toBe(true);
  expect(shouldReturnNow("handsfree", SETTINGS, "answered")).toBe(false);
  expect(shouldReturnNow("screen", SETTINGS, "sent")).toBe(false);
  expect(shouldReturnNow("handsfree", { ...SETTINGS, returnEnabled: false }, "sent")).toBe(false);
  expect(shouldReturnNow("handsfree", { ...SETTINGS, returnApp: null }, "sent")).toBe(false);
  expect(shouldReturnNow(null, SETTINGS, "sent")).toBe(false);
});

test("spoken messages", () => {
  expect(spokenMessage("no_speech")).toBe("聞き取れませんでした。もう一度お話しください。");
  expect(spokenMessage("agent_failed")).toBe("うまく答えられませんでした。もう一度お話しください。");
  expect(spokenMessage("transcribe_failed")).toBe(spokenMessage("agent_failed"));
  expect(spokenMessage("timeout")).toBe("時間切れです。もう一度お話しください。");
  expect(spokenMessage("network")).toBe("通信できないため、質問できませんでした。");
  expect(spokenMessage("invalid_key")).toBe("接続キーを確かめてください。");
  expect(spokenMessage("no_key")).toBe(spokenMessage("invalid_key"));
  expect(spokenMessage("mic")).toBe("録音できませんでした。");
  expect(BUSY_MESSAGE).toBe("いま応答中です。少し待ってからもう一度お話しください。");
});

test("server failure reasons", () => {
  expect(failureFromServer("no_speech")).toBe("no_speech");
  expect(failureFromServer("tts_failed")).toBe("tts_failed");
  expect(failureFromServer("something_new")).toBe("agent_failed");
  expect(failureFromServer(null)).toBe("agent_failed");
});
