import { PressTracker, STALE_PRESS_MS } from "../press";

test("each press is handled once", () => {
  const t = new PressTracker();
  expect(t.claim(1000, 1500)).toBe("new");
  expect(t.claim(1000, 1600)).toBe("duplicate");
  expect(t.claim(900, 1600)).toBe("duplicate");
  expect(t.claim(2000, 2100)).toBe("new");
});

test("old presses are dropped", () => {
  const t = new PressTracker();
  expect(t.claim(1000, 1000 + STALE_PRESS_MS + 1)).toBe("stale");
  expect(t.claim(1010, 1020)).toBe("new");
});
