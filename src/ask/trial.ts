// The trial recording on SC-12 (spec §5.5): recorded over the same route as a question started from the screen,
// played back at once on the media stream, sent nowhere and not kept.
import type { InputDevice } from "../../modules/audio-route/src";
import { RECORD_LIMIT_MS, TICK_MS } from "./controller";

export type TrialPhase = "idle" | "recording" | "playing";
export type TrialState = { phase: TrialPhase; phoneMic: boolean; device: InputDevice | null; error: string | null };
export const TRIAL_IDLE: TrialState = { phase: "idle", phoneMic: false, device: null, error: null };

export type TrialDeps = {
  now(): number;
  sleep(ms: number): Promise<void>;
  micAllowed(): Promise<boolean>;
  route: { start(): Promise<boolean>; stop(): Promise<void>; inputDevice(): InputDevice | null };
  // stop() returns the URI of the recorded PCM file.
  recorder: { start(): Promise<void>; stop(): Promise<string>; cancel(): Promise<void> };
  cueStart(): void;
  play(pcmUri: string): Promise<void>;
  stopPlayback(): void;
  discard(pcmUri: string): Promise<void>;
  onState(state: TrialState): void;
};

export const TRIAL_MESSAGES = {
  mic: "マイクの使用が許可されていません。",
  record: "録音できませんでした。",
  play: "再生できませんでした。",
} as const;

export class TrialController {
  state: TrialState = TRIAL_IDLE;
  private session = 0;
  private stopRequested = false;

  constructor(private readonly deps: TrialDeps) {}

  get active(): boolean {
    return this.state.phase !== "idle";
  }

  /** The screen button or the intercom button while a trial runs: end the recording, or the playback. */
  stop(): void {
    if (this.state.phase === "recording") this.stopRequested = true;
    else if (this.state.phase === "playing") this.deps.stopPlayback();
  }

  /** Leaving SC-12: drop whatever is going on. */
  cancel(): void {
    if (!this.active) return;
    this.session += 1;
    this.deps.stopPlayback();
    this.set(TRIAL_IDLE);
  }

  async start(): Promise<void> {
    if (this.active) return;
    const d = this.deps;
    const session = ++this.session;
    this.stopRequested = false;
    this.set({ ...TRIAL_IDLE, phase: "recording" });
    if (!(await d.micAllowed())) {
      this.finish(session, { ...TRIAL_IDLE, error: TRIAL_MESSAGES.mic });
      return;
    }
    const routed = await d.route.start();
    try {
      await d.recorder.start();
    } catch {
      await d.route.stop();
      this.finish(session, { ...TRIAL_IDLE, phoneMic: !routed, error: TRIAL_MESSAGES.record });
      return;
    }
    if (session === this.session) this.set({ ...this.state, phoneMic: !routed });
    d.cueStart();
    const startedAt = d.now();
    while (session === this.session && !this.stopRequested && d.now() - startedAt < RECORD_LIMIT_MS) {
      await d.sleep(TICK_MS);
    }
    if (session !== this.session) {
      await d.recorder.cancel();
      await d.route.stop();
      return;
    }
    const device = d.route.inputDevice();
    let uri: string;
    try {
      uri = await d.recorder.stop();
    } catch {
      await d.route.stop();
      this.finish(session, { ...TRIAL_IDLE, phoneMic: !routed, error: TRIAL_MESSAGES.record });
      return;
    }
    await d.route.stop();
    if (session !== this.session) {
      await d.discard(uri);
      return;
    }
    this.set({ ...this.state, phase: "playing", device });
    let error: string | null = null;
    try {
      await d.play(uri);
    } catch {
      error = TRIAL_MESSAGES.play;
    } finally {
      await d.discard(uri);
    }
    // Keep showing which microphone was used after the playback.
    this.finish(session, { ...this.state, phase: "idle", error });
  }

  private finish(session: number, state: TrialState): void {
    if (session === this.session) this.set(state);
  }

  private set(state: TrialState): void {
    this.state = state;
    this.deps.onState(state);
  }
}
