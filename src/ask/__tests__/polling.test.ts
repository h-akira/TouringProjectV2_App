import { ApiError, AskResult } from "../../api/client";
import { nextDelay, pollUntilDone, POLL_TIMEOUT_MS } from "../polling";

const result = (status: AskResult["status"]): AskResult => ({ askId: "a", status, transcript: null, answer: null, audio: [], error: null, timings: {} });

function clock() {
  let now = 0;
  return { now: () => now, sleep: async (ms: number) => { now += ms; } };
}

test("delays are 1s for 10s then 2s", () => {
  expect(nextDelay(0)).toBe(1000);
  expect(nextDelay(9999)).toBe(1000);
  expect(nextDelay(10000)).toBe(2000);
});

test("returns the first finished result", async () => {
  const c = clock();
  const answers = [result("processing"), result("processing"), result("completed")];
  const done = await pollUntilDone(async () => answers.shift()!, { ...c, isCancelled: () => false });
  expect(done).toMatchObject({ status: "completed" });
  expect(c.now()).toBe(3000);
});

test("transient errors are skipped", async () => {
  const c = clock();
  const outcomes: Array<AskResult | Error> = [new ApiError("network"), result("failed")];
  const done = await pollUntilDone(async () => { const o = outcomes.shift()!; if (o instanceof Error) throw o; return o; }, { ...c, isCancelled: () => false });
  expect(done).toMatchObject({ status: "failed" });
});

test("invalid key stops polling", async () => {
  const c = clock();
  await expect(pollUntilDone(async () => { throw new ApiError("invalid_key"); }, { ...c, isCancelled: () => false })).rejects.toMatchObject({ kind: "invalid_key" });
});

test("gives up after two minutes", async () => {
  const c = clock();
  expect(await pollUntilDone(async () => result("processing"), { ...c, isCancelled: () => false })).toBe("timeout");
  expect(c.now()).toBeGreaterThanOrEqual(POLL_TIMEOUT_MS);
  expect(c.now()).toBeLessThan(POLL_TIMEOUT_MS + 2000);
});

test("cancellation stops polling", async () => {
  const c = clock();
  let calls = 0;
  const done = await pollUntilDone(async () => { calls += 1; return result("processing"); }, { ...c, isCancelled: () => calls >= 2 });
  expect(done).toBe("cancelled");
});
