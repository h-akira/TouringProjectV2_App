import { ConversationState } from "../conversation";

test("conversation continues until it expires", () => {
  const c = new ConversationState();
  expect(c.current(0)).toBeNull();
  c.update("abc", "1970-01-01T00:15:00.000Z");
  expect(c.current(14 * 60 * 1000)).toBe("abc");
  expect(c.expiresAt(14 * 60 * 1000)).toBe(15 * 60 * 1000);
  expect(c.current(15 * 60 * 1000)).toBeNull();
  expect(c.expiresAt(15 * 60 * 1000)).toBeNull();
});

test("reset starts a new conversation", () => {
  const c = new ConversationState();
  c.update("abc", "2999-01-01T00:00:00.000Z");
  c.reset();
  expect(c.current(0)).toBeNull();
});

test("unparseable expiry means no conversation", () => {
  const c = new ConversationState();
  c.update("abc", "not a date");
  expect(c.current(0)).toBeNull();
});
