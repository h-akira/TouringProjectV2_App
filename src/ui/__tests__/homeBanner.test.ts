import { homeBanner, mediaVolumeLow } from "../homeBanner";

test("media volume below a third of the maximum is low", () => {
  expect(mediaVolumeLow({ current: 2, max: 25 })).toBe(true);
  expect(mediaVolumeLow({ current: 8, max: 25 })).toBe(true);
  expect(mediaVolumeLow({ current: 9, max: 25 })).toBe(false);
  expect(mediaVolumeLow({ current: 5, max: 15 })).toBe(false);
  expect(mediaVolumeLow({ current: 0, max: 0 })).toBe(false);
  expect(mediaVolumeLow(null)).toBe(false);
});

test("one band at a time, the most important first", () => {
  expect(homeBanner({ hasKey: false, returnAppMissing: true, volumeLow: true })).toBe("no_key");
  expect(homeBanner({ hasKey: true, returnAppMissing: true, volumeLow: true })).toBe("no_return_app");
  expect(homeBanner({ hasKey: true, returnAppMissing: false, volumeLow: true })).toBe("low_volume");
  expect(homeBanner({ hasKey: true, returnAppMissing: false, volumeLow: false })).toBeNull();
});
