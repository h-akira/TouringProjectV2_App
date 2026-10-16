// SC-02: when the current conversation lapses, shown in Japan time.
export function conversationLabel(expiresAt: number | null, now: number): string {
  if (expiresAt === null || expiresAt <= now) return "新しい会話です";
  const jst = new Date(expiresAt + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} まで質問がなければ自動で区切ります`;
}
