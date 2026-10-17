import { durationLabel, recordedAtLabel, transcriptLabel } from "../recordingLabel";

test("recorded time in Japan time", () => {
  expect(recordedAtLabel(Date.parse("2026-10-16T23:05:09Z"))).toBe("10/17 08:05:09");
});

test("duration in seconds", () => {
  expect(durationLabel(3240)).toBe("3.2秒");
  expect(durationLabel(0)).toBe("0.0秒");
});

test("transcript: not yet, nothing heard, or the text", () => {
  expect(transcriptLabel(null)).toEqual({ text: "（聞き取られた文はまだありません）", failed: false });
  expect(transcriptLabel("")).toEqual({ text: "聞き取れませんでした", failed: true });
  expect(transcriptLabel("右手の山は？")).toEqual({ text: "右手の山は？", failed: false });
});
