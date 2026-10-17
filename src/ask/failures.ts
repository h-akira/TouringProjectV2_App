// What the rider hears when something goes wrong (spec §8.1).
import type { FailureReason } from "./flow";

export const BUSY_MESSAGE = "いま応答中です。少し待ってからもう一度お話しください。";

const MESSAGES: Record<FailureReason, string> = {
  no_speech: "聞き取れませんでした。もう一度お話しください。",
  transcribe_failed: "うまく答えられませんでした。もう一度お話しください。",
  agent_failed: "うまく答えられませんでした。もう一度お話しください。",
  tts_failed: "うまく答えられませんでした。もう一度お話しください。",
  timeout: "時間切れです。もう一度お話しください。",
  network: "通信できないため、質問できませんでした。",
  invalid_key: "接続キーを確かめてください。",
  no_key: "接続キーを確かめてください。",
  mic: "録音できませんでした。",
  service: "準備できなかったため、質問できませんでした。もう一度お試しください。",
};

export function spokenMessage(reason: FailureReason): string {
  return MESSAGES[reason];
}

const SERVER_REASONS: FailureReason[] = ["no_speech", "transcribe_failed", "agent_failed", "tts_failed"];

export function failureFromServer(error: string | null): FailureReason {
  return SERVER_REASONS.includes(error as FailureReason) ? (error as FailureReason) : "agent_failed";
}
