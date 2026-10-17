// Settings kept on the device. The connection key lives separately in SecureStore (storage.ts).
export type ReturnTiming = "sent" | "answered" | "spoken";
export type LaunchableApp = { packageName: string; label: string };
// How much the Backend raises the answer audio (SC-21). The Backend accepts exactly these values; Polly stops at +6 dB.
export const VOLUME_DB_CHOICES = [0, 3, 6] as const;
export type VolumeDb = (typeof VOLUME_DB_CHOICES)[number];
export const DEFAULT_VOLUME_DB: VolumeDb = 6;
export type Settings = {
  userName: string;
  returnEnabled: boolean;
  returnApp: LaunchableApp | null;
  returnTiming: ReturnTiming;
  recentApps: LaunchableApp[];
  answerVolumeDb: VolumeDb;
};

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const SETTINGS_KEY = "trv2.settings";
export const USER_NAME_RE = /^[a-z0-9]{3,20}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TIMINGS: ReturnTiming[] = ["sent", "answered", "spoken"];

export function randomUserName(random: () => number = Math.random): string {
  let name = "";
  for (let i = 0; i < 6; i += 1) {
    name += ALPHABET[Math.floor(random() * ALPHABET.length) % ALPHABET.length];
  }
  return name;
}

function isApp(value: unknown): value is LaunchableApp {
  const app = value as LaunchableApp;
  return typeof app === "object" && app !== null && typeof app.packageName === "string" && typeof app.label === "string";
}

function parse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return typeof value === "object" && value !== null ? value : {};
  } catch {
    return {};
  }
}

export async function loadSettings(store: KeyValueStore, random: () => number = Math.random): Promise<Settings> {
  const raw = parse(await store.getItem(SETTINGS_KEY));
  const userName = typeof raw.userName === "string" && USER_NAME_RE.test(raw.userName) ? raw.userName : null;
  const settings: Settings = {
    userName: userName ?? randomUserName(random),
    returnEnabled: typeof raw.returnEnabled === "boolean" ? raw.returnEnabled : true,
    returnApp: isApp(raw.returnApp) ? raw.returnApp : null,
    returnTiming: TIMINGS.includes(raw.returnTiming as ReturnTiming) ? (raw.returnTiming as ReturnTiming) : "sent",
    recentApps: Array.isArray(raw.recentApps) ? raw.recentApps.filter(isApp) : [],
    answerVolumeDb: VOLUME_DB_CHOICES.includes(raw.answerVolumeDb as VolumeDb) ? (raw.answerVolumeDb as VolumeDb) : DEFAULT_VOLUME_DB,
  };
  if (userName === null) await saveSettings(store, settings);
  return settings;
}

export async function saveSettings(store: KeyValueStore, settings: Settings): Promise<void> {
  await store.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function withRecentApp(recent: LaunchableApp[], app: LaunchableApp, max = 5): LaunchableApp[] {
  return [app, ...recent.filter((a) => a.packageName !== app.packageName)].slice(0, max);
}

export function maskKey(key: string): string {
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}
