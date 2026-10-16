// The last few recordings stay on the device for the recording check screen (US-C-06.001).
export const KEEP_RECORDINGS = 10;
const NAME_RE = /^rec-(\d+)\.pcm$/;

export function recordingName(now: number): string {
  return `rec-${now}.pcm`;
}

export function recordingsToDelete(names: string[], keep = KEEP_RECORDINGS): string[] {
  const recordings = names
    .map((name) => ({ name, match: NAME_RE.exec(name) }))
    .filter((r) => r.match !== null)
    .sort((a, b) => Number(b.match![1]) - Number(a.match![1]));
  return recordings.slice(keep).map((r) => r.name);
}
