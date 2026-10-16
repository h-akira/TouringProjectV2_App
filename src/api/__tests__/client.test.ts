import { ApiClient, ApiError } from "../client";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift()!;
    if (next instanceof Error) throw next;
    return { status: next.status, json: async () => next.body ?? {} } as Response;
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

function client(responses: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(responses);
  const sleeps: number[] = [];
  const api = new ApiClient({ baseUrl: "https://api.example/Prod/", apiKey: "k", userName: "rider01", fetchFn: fake.fn, sleep: async (ms) => { sleeps.push(ms); } });
  return { api, calls: fake.calls, sleeps };
}

const ACCEPTED = { askId: "a", conversationId: "c", conversationExpiresAt: "2026-10-16T03:15:00.000Z" };

test("postAsk sends headers and json", async () => {
  const { api, calls } = client([{ status: 202, body: ACCEPTED }]);
  expect(await api.postAsk({ text: "Q" })).toEqual(ACCEPTED);
  expect(calls[0].url).toBe("https://api.example/Prod/asks");
  expect(calls[0].init.method).toBe("POST");
  expect(calls[0].init.headers).toEqual({ "content-type": "application/json", "x-api-key": "k", "x-user-name": "rider01" });
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ text: "Q" });
});

test.each([
  [403, "invalid_key"],
  [400, "bad_request"],
  [404, "not_found"],
  [500, "server"],
])("status %i is %s", async (status, kind) => {
  const { api } = client([{ status }, { status }, { status }]);
  await expect(api.getAsk("a")).rejects.toMatchObject({ kind });
});

test("get retries transient errors then succeeds", async () => {
  const { api, sleeps } = client([new TypeError("offline"), { status: 503 }, { status: 200, body: { askId: "a", status: "processing" } }]);
  expect((await api.getAsk("a")).status).toBe("processing");
  expect(sleeps).toEqual([500, 1000]);
});

test("post does not retry network errors but retries 429", async () => {
  const offline = client([new TypeError("offline")]);
  await expect(offline.api.postAsk({ text: "Q" })).rejects.toMatchObject({ kind: "network" });
  expect(offline.calls).toHaveLength(1);
  const limited = client([{ status: 429 }, { status: 202, body: ACCEPTED }]);
  expect(await limited.api.postAsk({ text: "Q" })).toEqual(ACCEPTED);
});

test("invalid key is not retried", async () => {
  const { api, calls } = client([{ status: 403 }]);
  await expect(api.getAsk("a")).rejects.toBeInstanceOf(ApiError);
  expect(calls).toHaveLength(1);
});

test("checkKey treats 404 as a working key", async () => {
  await expect(client([{ status: 404 }]).api.checkKey()).resolves.toBeUndefined();
  await expect(client([{ status: 403 }]).api.checkKey()).rejects.toMatchObject({ kind: "invalid_key" });
});
