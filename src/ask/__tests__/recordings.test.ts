import {
  base64Bytes, metaName, micLabel, newestFirst, parseMeta, pcmDurationMs, recordingName, recordingsToDelete, RecordingMeta, wavHeader,
} from "../recordings";

const META: RecordingMeta = {
  name: "rec-1000.pcm", recordedAt: 1000, durationMs: 3000, phoneMic: false, device: { type: "bluetooth", name: "M1-S PRO" }, transcript: null,
};

test("name carries the time", () => {
  expect(recordingName(1234)).toBe("rec-1234.pcm");
  expect(metaName("rec-1234.pcm")).toBe("rec-1234.json");
});

test("keeps the newest ten recordings", () => {
  const names = Array.from({ length: 12 }, (_, i) => recordingName(1000 + i)).concat(["notes.txt"]);
  expect(recordingsToDelete(names).sort()).toEqual(["rec-1000.pcm", "rec-1001.pcm"]);
  expect(recordingsToDelete(names.slice(0, 3))).toEqual([]);
});

test("an old recording's JSON goes with its PCM", () => {
  const names = Array.from({ length: 11 }, (_, i) => [recordingName(1000 + i), metaName(recordingName(1000 + i))]).flat();
  expect(recordingsToDelete(names).sort()).toEqual(["rec-1000.json", "rec-1000.pcm"]);
});

test("PCM size to duration", () => {
  expect(base64Bytes("AAAA")).toBe(3);
  expect(base64Bytes("AAA=")).toBe(2);
  expect(base64Bytes("AA==")).toBe(1);
  expect(pcmDurationMs(32_000 * 3)).toBe(3000);
  expect(pcmDurationMs(16_000)).toBe(500);
});

test("meta round trips and broken meta is rejected", () => {
  expect(parseMeta(JSON.stringify(META))).toEqual(META);
  expect(parseMeta(JSON.stringify({ ...META, device: { type: "x" }, transcript: 3 }))).toEqual({ ...META, device: null, transcript: null });
  expect(parseMeta("{oops")).toBeNull();
  expect(parseMeta("null")).toBeNull();
  expect(parseMeta(JSON.stringify({ ...META, name: "../x" }))).toBeNull();
  expect(parseMeta(JSON.stringify({ ...META, durationMs: "3" }))).toBeNull();
});

test("newest first", () => {
  const older = { ...META, name: "rec-1.pcm", recordedAt: 1 };
  expect(newestFirst([older, META]).map((m) => m.name)).toEqual(["rec-1000.pcm", "rec-1.pcm"]);
});

test("WAV header for 16 kHz mono 16-bit", () => {
  const h = wavHeader(32_000);
  const view = new DataView(h.buffer);
  const text = (from: number) => String.fromCharCode(...h.slice(from, from + 4));
  expect(h).toHaveLength(44);
  expect([text(0), text(8), text(12), text(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
  expect(view.getUint32(4, true)).toBe(36 + 32_000);
  expect(view.getUint16(20, true)).toBe(1);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(16_000);
  expect(view.getUint32(28, true)).toBe(32_000);
  expect(view.getUint16(32, true)).toBe(2);
  expect(view.getUint16(34, true)).toBe(16);
  expect(view.getUint32(40, true)).toBe(32_000);
});

test("mic label", () => {
  expect(micLabel(META)).toBe("インカム（M1-S PRO）");
  expect(micLabel({ phoneMic: true, device: null })).toBe("本体のマイク");
});
