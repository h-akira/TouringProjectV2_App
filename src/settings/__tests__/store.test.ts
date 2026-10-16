import { KeyValueStore, loadSettings, maskKey, randomUserName, saveSettings, USER_NAME_RE, withRecentApp } from "../store";

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  async getItem(key: string) { return this.data.get(key) ?? null; }
  async setItem(key: string, value: string) { this.data.set(key, value); }
}

const MAPS = { packageName: "com.google.android.apps.maps", label: "マップ" };

test("random user name is 6 lowercase letters or digits", () => {
  const name = randomUserName();
  expect(name).toMatch(/^[a-z0-9]{6}$/);
  expect(USER_NAME_RE.test(name)).toBe(true);
});

test("first load creates and saves a user name with defaults", async () => {
  const store = new MemoryStore();
  const settings = await loadSettings(store, () => 0);
  expect(settings).toEqual({ userName: "aaaaaa", returnEnabled: true, returnApp: null, returnTiming: "sent", recentApps: [] });
  expect(JSON.parse(store.data.get("trv2.settings")!).userName).toBe("aaaaaa");
});

test("saved settings round trip", async () => {
  const store = new MemoryStore();
  const settings = { userName: "rider01", returnEnabled: false, returnApp: MAPS, returnTiming: "spoken" as const, recentApps: [MAPS] };
  await saveSettings(store, settings);
  expect(await loadSettings(store)).toEqual(settings);
});

test("broken values fall back to defaults", async () => {
  const store = new MemoryStore();
  store.data.set("trv2.settings", JSON.stringify({ userName: "BAD NAME", returnTiming: "later", returnApp: { label: 1 }, recentApps: "x" }));
  const settings = await loadSettings(store, () => 0.5);
  expect(settings.userName).toMatch(/^[a-z0-9]{6}$/);
  expect(settings.returnTiming).toBe("sent");
  expect(settings.returnApp).toBeNull();
  expect(settings.recentApps).toEqual([]);
});

test("not JSON falls back to defaults", async () => {
  const store = new MemoryStore();
  store.data.set("trv2.settings", "{oops");
  expect((await loadSettings(store, () => 0)).userName).toBe("aaaaaa");
});

test("recent apps keep the latest five without duplicates", () => {
  const apps = Array.from({ length: 6 }, (_, i) => ({ packageName: `p${i}`, label: `L${i}` }));
  const recent = apps.reduce((list, app) => withRecentApp(list, app), [] as typeof apps);
  expect(recent.map((a) => a.packageName)).toEqual(["p5", "p4", "p3", "p2", "p1"]);
  expect(withRecentApp(recent, apps[3]).map((a) => a.packageName)).toEqual(["p3", "p5", "p4", "p2", "p1"]);
});

test("mask shows only the last four characters", () => {
  expect(maskKey("abcdefgh1234")).toBe("••••••••1234");
  expect(maskKey("abc")).toBe("••••");
});
