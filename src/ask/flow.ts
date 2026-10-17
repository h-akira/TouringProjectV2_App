// The ask loop as a pure state machine (spec §5.2). Screens, cues and returning to the nav app read this state.
import type { Settings } from "../settings/store";

export type Source = "handsfree" | "screen";
export type Phase = "idle" | "recording" | "sending" | "waiting" | "speaking" | "failed";
export type FailureReason =
  | "no_speech"
  | "transcribe_failed"
  | "agent_failed"
  | "tts_failed"
  | "timeout"
  | "network"
  | "invalid_key"
  | "no_key"
  | "mic"
  | "service";

export type FlowState = {
  phase: Phase;
  source: Source | null;
  askId: string | null;
  answer: string | null;
  failure: FailureReason | null;
  phoneMic: boolean;
  phaseStartedAt: number;
};

export type FlowEvent =
  | { type: "start"; source: Source; now: number }
  | { type: "phoneMic"; now: number }
  | { type: "stopRecording"; now: number }
  | { type: "sent"; askId: string; now: number }
  | { type: "answered"; answer: string; now: number }
  | { type: "spoken"; now: number }
  | { type: "fail"; reason: FailureReason; now: number }
  | { type: "dismiss"; now: number };

export const IDLE: FlowState = { phase: "idle", source: null, askId: null, answer: null, failure: null, phoneMic: false, phaseStartedAt: 0 };

export function reduce(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "start":
      return state.phase === "idle" || state.phase === "failed"
        ? { ...IDLE, phase: "recording", source: event.source, phaseStartedAt: event.now }
        : state;
    case "phoneMic":
      return state.phase === "recording" ? { ...state, phoneMic: true } : state;
    case "stopRecording":
      return state.phase === "recording" ? { ...state, phase: "sending", phaseStartedAt: event.now } : state;
    case "sent":
      return state.phase === "sending" ? { ...state, phase: "waiting", askId: event.askId, phaseStartedAt: event.now } : state;
    case "answered":
      return state.phase === "waiting" ? { ...state, phase: "speaking", answer: event.answer, phaseStartedAt: event.now } : state;
    case "fail":
      return state.phase === "idle" ? state : { ...state, phase: "failed", failure: event.reason, phaseStartedAt: event.now };
    case "spoken":
    case "dismiss":
      return state.phase === "idle" ? state : IDLE;
  }
}

export function isBusy(state: FlowState): boolean {
  return state.phase !== "idle" && state.phase !== "failed";
}

export type Moment = "sent" | "answered" | "spoken";

export function shouldReturnNow(source: Source | null, settings: Settings, moment: Moment): boolean {
  return source === "handsfree" && settings.returnEnabled && settings.returnApp !== null && settings.returnTiming === moment;
}
