import { conversationLabel } from "../conversationLabel";

test("no conversation", () => {
  expect(conversationLabel(null, 0)).toBe("新しい会話です");
});

test("shows when it will be reset in Japan time", () => {
  const expiresAt = Date.parse("2026-10-16T03:15:00Z");
  expect(conversationLabel(expiresAt, expiresAt - 60_000)).toBe("12:15 まで質問がなければ自動で区切ります");
});
