import type { Phase } from "../ask/flow";

// SC-03: the state must be readable from color alone.
const COLORS: Record<Phase, string> = {
  idle: "#000000",
  recording: "#d42a2a",
  sending: "#d42a2a",
  waiting: "#1f4fd1",
  speaking: "#13804a",
  failed: "#5b6170",
};

export function phaseColor(phase: Phase): string {
  return COLORS[phase];
}
