import { PressGate, PressTracker, STALE_PRESS_MS } from "../press";

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

describe("PressGate", () => {
  test("a press before the controller exists is handled once it does", () => {
    const handled: number[] = [];
    const gate = new PressGate(() => handled.push(1));
    gate.offer(1000, 1000);
    expect(handled).toHaveLength(0);
    gate.openGate(3000);
    expect(handled).toHaveLength(1);
  });

  test("several early presses start one question", () => {
    let count = 0;
    const gate = new PressGate(() => { count += 1; });
    gate.offer(1000, 1000);
    gate.offer(1500, 1500);
    gate.openGate(2000);
    gate.offer(1500, 2100); // the same press again as the pending one at launch
    expect(count).toBe(1);
  });

  test("an early press that went stale while waiting is dropped", () => {
    let count = 0;
    const gate = new PressGate(() => { count += 1; });
    gate.offer(1000, 1000);
    gate.openGate(1000 + STALE_PRESS_MS + 1);
    expect(count).toBe(0);
  });

  test("after opening, presses go straight through and duplicates are dropped", () => {
    let count = 0;
    const gate = new PressGate(() => { count += 1; });
    gate.openGate(0);
    gate.offer(1000, 1000);
    gate.offer(1000, 1100);
    gate.offer(2000, 2000);
    expect(count).toBe(2);
  });
});
