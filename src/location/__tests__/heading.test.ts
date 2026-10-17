import { distanceMeters, Fix, pickHeadingSample } from "../heading";

const at = (latitude: number, timestamp: number, accuracy: number | null = 5): Fix => ({ latitude, longitude: 139.7671, timestamp, accuracy });
const NOW = 1_800_000_000_000;
const current = at(35.6812, NOW);

test("distance", () => {
  expect(distanceMeters(at(35.68066, 0), current)).toBeCloseTo(60, 0);
});

test("picks the newest point far enough behind", () => {
  const fixes = [at(35.6800, NOW - 30_000), at(35.6806, NOW - 10_000), at(35.6811, NOW - 2_000)];
  expect(pickHeadingSample(fixes, current)).toEqual({ latitude: 35.6806, longitude: 139.7671, at: new Date(NOW - 10_000).toISOString() });
});

test("test_no_sample_when_stationary", () => {
  const fixes = [at(35.68119, NOW - 20_000), at(35.6812, NOW - 10_000)];
  expect(pickHeadingSample(fixes, current)).toBeNull();
});

test("ignores points older than a minute and points not before the current one", () => {
  expect(pickHeadingSample([at(35.6790, NOW - 61_000)], current)).toBeNull();
  expect(pickHeadingSample([at(35.6790, NOW + 1_000)], current)).toBeNull();
  expect(pickHeadingSample([], current)).toBeNull();
});

test("test_no_sample_from_inaccurate_points", () => {
  // Stationary, but a 40 m fix 60 m away would otherwise look like movement.
  expect(pickHeadingSample([at(35.68066, NOW - 10_000, 40)], current)).toBeNull();
  expect(pickHeadingSample([at(35.68066, NOW - 10_000, 5), at(35.6809, NOW - 5_000, 40)], current)).toEqual({
    latitude: 35.68066, longitude: 139.7671, at: new Date(NOW - 10_000).toISOString(),
  });
});

test("no sample when the current point itself is inaccurate", () => {
  expect(pickHeadingSample([at(35.68066, NOW - 10_000)], at(35.6812, NOW, 50))).toBeNull();
});

test("unknown accuracy is accepted", () => {
  expect(pickHeadingSample([at(35.68066, NOW - 10_000, null)], at(35.6812, NOW, null))).not.toBeNull();
});
