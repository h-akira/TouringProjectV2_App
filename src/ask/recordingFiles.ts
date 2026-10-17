// The kept recordings on disk (spec §5.4): rec-<time>.pcm with rec-<time>.json beside it. Thin on purpose; the
// decisions are in recordings.ts. Directories use the legacy API the recorder already uses; WAV needs raw bytes.
import { File, Paths } from "expo-file-system";
import {
  deleteAsync, documentDirectory, getInfoAsync, makeDirectoryAsync, readAsStringAsync, readDirectoryAsync, writeAsStringAsync,
} from "expo-file-system/legacy";

import { metaName, newestFirst, parseMeta, recordingName, RecordingMeta, recordingsToDelete, wavHeader } from "./recordings";

export const RECORDINGS_DIR = `${documentDirectory}recordings/`;

export async function newRecordingUri(now: number): Promise<{ uri: string; name: string }> {
  await makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  const name = recordingName(now);
  return { uri: `${RECORDINGS_DIR}${name}`, name };
}

export async function pruneRecordings(): Promise<void> {
  const names = await readDirectoryAsync(RECORDINGS_DIR);
  await Promise.all(recordingsToDelete(names).map((name) => deleteAsync(`${RECORDINGS_DIR}${name}`, { idempotent: true })));
}

export async function saveMeta(meta: RecordingMeta): Promise<void> {
  await writeAsStringAsync(`${RECORDINGS_DIR}${metaName(meta.name)}`, JSON.stringify(meta));
}

export async function setTranscript(name: string, transcript: string): Promise<void> {
  const uri = `${RECORDINGS_DIR}${metaName(name)}`;
  if (!(await getInfoAsync(uri)).exists) return;
  const meta = parseMeta(await readAsStringAsync(uri));
  if (meta) await writeAsStringAsync(uri, JSON.stringify({ ...meta, transcript }));
}

export async function listRecordings(): Promise<RecordingMeta[]> {
  if (!(await getInfoAsync(RECORDINGS_DIR)).exists) return [];
  const names = new Set(await readDirectoryAsync(RECORDINGS_DIR));
  const metas: RecordingMeta[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const meta = parseMeta(await readAsStringAsync(`${RECORDINGS_DIR}${name}`).catch(() => ""));
    if (meta && names.has(meta.name)) metas.push(meta);
  }
  return newestFirst(metas);
}

export async function deleteAllRecordings(): Promise<void> {
  await deleteAsync(RECORDINGS_DIR, { idempotent: true });
}

export function recordingUri(name: string): string {
  return `${RECORDINGS_DIR}${name}`;
}

/** Copies a PCM file into a playable WAV file in the cache and returns its URI. */
export async function wavFromPcm(pcmUri: string, wavName: string): Promise<string> {
  const pcm = await new File(pcmUri).bytes();
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(wavHeader(pcm.length), 0);
  wav.set(pcm, 44);
  const out = new File(Paths.cache, wavName);
  await out.write(wav);
  return out.uri;
}
