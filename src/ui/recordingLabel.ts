// SC-12: how a kept recording is described, in Japan time.
export function recordedAtLabel(ms: number): string {
  const jst = new Date(ms + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}`;
}

export function durationLabel(ms: number): string {
  return `${(ms / 1000).toFixed(1)}秒`;
}

export function transcriptLabel(transcript: string | null): { text: string; failed: boolean } {
  if (transcript === null) return { text: "（聞き取られた文はまだありません）", failed: false };
  if (transcript === "") return { text: "聞き取れませんでした", failed: true };
  return { text: transcript, failed: false };
}
