import { recordingName, recordingsToDelete } from "../recordings";

test("name carries the time", () => {
  expect(recordingName(1234)).toBe("rec-1234.pcm");
});

test("keeps the newest ten recordings", () => {
  const names = Array.from({ length: 12 }, (_, i) => recordingName(1000 + i)).concat(["notes.txt"]);
  expect(recordingsToDelete(names).sort()).toEqual(["rec-1000.pcm", "rec-1001.pcm"]);
  expect(recordingsToDelete(names.slice(0, 3))).toEqual([]);
});
