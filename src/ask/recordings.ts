// The last few recordings stay on the device for the recording check screen (US-C-06.001). Each PCM file has a
// JSON file of the same name beside it with what SC-12 shows (spec §5.4).
import type { InputDevice } from "../../modules/audio-route/src";

export const KEEP_RECORDINGS = 10;
export const PCM_BYTES_PER_SECOND = 16_000 * 2; // 16 kHz, mono, 16-bit
const NAME_RE = /^rec-(\d+)\.(pcm|json)$/;

export type RecordingMeta = {
  name: string; // the PCM file name
  recordedAt: number;
  durationMs: number;
  phoneMic: boolean;
  device: InputDevice | null;
  transcript: string | null;
};

export function recordingName(now: number): string {
  return `rec-${now}.pcm`;
}

export function metaName(pcmName: string): string {
  return pcmName.replace(/\.pcm$/, ".json");
}

/** Files of all but the newest `keep` recordings: the PCM and its JSON go together. */
export function recordingsToDelete(names: string[], keep = KEEP_RECORDINGS): string[] {
  const parsed = names.map((name) => ({ name, match: NAME_RE.exec(name) })).filter((r) => r.match !== null);
  const times = [...new Set(parsed.map((r) => Number(r.match![1])))].sort((a, b) => b - a);
  const old = new Set(times.slice(keep));
  return parsed.filter((r) => old.has(Number(r.match![1]))).map((r) => r.name);
}

export function base64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export function pcmDurationMs(bytes: number): number {
  return Math.round((bytes / PCM_BYTES_PER_SECOND) * 1000);
}

function isDevice(value: unknown): value is InputDevice {
  const d = value as InputDevice;
  return typeof d === "object" && d !== null && ["bluetooth", "builtin", "other"].includes(d.type) && typeof d.name === "string";
}

export function parseMeta(text: string): RecordingMeta | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  if (typeof raw.name !== "string" || !NAME_RE.test(raw.name)) return null;
  if (typeof raw.recordedAt !== "number" || typeof raw.durationMs !== "number" || typeof raw.phoneMic !== "boolean") return null;
  return {
    name: raw.name,
    recordedAt: raw.recordedAt,
    durationMs: raw.durationMs,
    phoneMic: raw.phoneMic,
    device: isDevice(raw.device) ? raw.device : null,
    transcript: typeof raw.transcript === "string" ? raw.transcript : null,
  };
}

export function newestFirst(metas: RecordingMeta[]): RecordingMeta[] {
  return [...metas].sort((a, b) => b.recordedAt - a.recordedAt);
}

/** A 44-byte RIFF/WAVE header for 16 kHz mono 16-bit PCM; expo-audio cannot play raw PCM. */
export function wavHeader(pcmBytes: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 16_000, true); // sample rate
  view.setUint32(28, PCM_BYTES_PER_SECOND, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, pcmBytes, true);
  return header;
}

/** One-line label of the microphone for SC-12. */
export function micLabel(meta: Pick<RecordingMeta, "phoneMic" | "device">): string {
  const kind = meta.phoneMic ? "本体のマイク" : "インカム";
  return meta.device ? `${kind}（${meta.device.name}）` : kind;
}
