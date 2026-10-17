// Orchestrates one ask: record -> send -> (return to nav) -> wait -> speak. All side effects come in through Deps
// so the whole loop is testable; waits use deps.sleep, which is native in the app (setTimeout stops in the background).
import type { InputDevice, MediaVolume } from "../../modules/audio-route/src";
import { ApiError, AskAccepted, AskBody, AskResult } from "../api/client";
import type { Settings } from "../settings/store";
import { Fix, pickHeadingSample } from "../location/heading";
import { ConversationState } from "./conversation";
import { BUSY_MESSAGE, failureFromServer, spokenMessage } from "./failures";
import { FailureReason, FlowEvent, FlowState, IDLE, isBusy, Moment, reduce, shouldReturnNow, Source } from "./flow";
import { pollUntilDone } from "./polling";
import { base64Bytes, pcmDurationMs, RecordingMeta } from "./recordings";

export const RECORD_LIMIT_MS = 20_000;
export const TICK_MS = 250;
export const WAITING_CUE_MS = 5_000;
export const FAILED_SCREEN_MS = 5_000;

export interface AskApi {
  postAsk(body: AskBody): Promise<AskAccepted>;
  getAsk(askId: string): Promise<AskResult>;
}

export type Deps = {
  now(): number;
  sleep(ms: number): Promise<void>;
  settings(): Settings;
  apiKey(): string | null;
  micAllowed(): Promise<boolean>;
  mediaVolume(): MediaVolume | null;
  api(apiKey: string, userName: string): AskApi;
  conversation: ConversationState;
  route: { start(source: Source): Promise<boolean>; stop(): Promise<void>; inputDevice(): InputDevice | null };
  // stop() returns the PCM as base64 and the name of the file it stays in (spec §5.4).
  recorder: { start(): Promise<void>; stop(): Promise<{ audio: string; name: string }>; cancel(): Promise<void> };
  // What SC-12 shows about each kept recording. Fire and forget: a failure here must not end the ask.
  recordings: { saved(meta: RecordingMeta): void; transcribed(name: string, transcript: string): void };
  location: { begin(): void; end(): { current: Fix | null; fixes: Fix[] } };
  service: { start(): void; stop(): void };
  nav: { returnTo(packageName: string): Promise<boolean> };
  cues: { start(): void; sent(): void; waiting(): void; failure(): void };
  player: { play(urls: string[]): Promise<void>; stop(): void };
  speech: { say(text: string): Promise<void>; stop(): void };
  onState(state: FlowState): void;
  log(event: string, data?: Record<string, unknown>): void;
};

type Recording = { audio: string; name: string; current: Fix | null; fixes: Fix[] };
// Per-ask state: an older ask that is still unwinding must not read or change the newer one's.
type Run = { id: number; source: Source; returned: boolean };

function reasonFor(error: unknown): FailureReason {
  if (error instanceof ApiError) {
    if (error.kind === "invalid_key") return "invalid_key";
    if (error.kind === "bad_request") return "no_speech";
  }
  return "network";
}

export class AskController {
  state: FlowState = IDLE;
  private runId = 0;
  private current: Run | null = null;
  private serviceRunning = false;
  // "いま応答中です…" being said; the answer waits for it so the two never overlap.
  private busySpeech: Promise<void> | null = null;

  constructor(private readonly deps: Deps) {}

  /** The intercom button: start, stop the recording, or say that an answer is on its way. */
  press(): void {
    if (this.state.phase === "recording") {
      this.stopRecording();
    } else if (this.state.phase === "speaking") {
      // The answer is already being heard; a spoken notice would only talk over it.
    } else if (isBusy(this.state)) {
      void this.sayBusy();
    } else {
      void this.run("handsfree");
    }
  }

  tapToTalk(): void {
    if (!isBusy(this.state)) void this.run("screen");
  }

  stopRecording(): void {
    if (this.state.phase === "recording") this.dispatch({ type: "stopRecording", now: this.deps.now() });
  }

  /** The big button: end the current ask now; whatever it is awaiting is ignored when it returns. */
  cancel(): void {
    if (this.state.phase === "idle") return;
    this.runId += 1;
    this.current = null;
    this.deps.player.stop();
    this.deps.speech.stop();
    this.dispatch({ type: "dismiss", now: this.deps.now() });
    this.stopService();
  }

  resetConversation(): void {
    this.deps.conversation.reset();
  }

  async run(source: Source): Promise<void> {
    const d = this.deps;
    // A previous ask may still be reading its failure message; the new ask takes over the audio.
    if (this.state.phase === "failed") d.speech.stop();
    const run: Run = { id: ++this.runId, source, returned: false };
    this.current = run;
    this.dispatch({ type: "start", source, now: d.now(), mediaVolume: d.mediaVolume() });
    try {
      const apiKey = d.apiKey();
      if (!apiKey) {
        await this.fail("no_key", run);
        return;
      }
      if (!(await d.micAllowed())) {
        await this.fail("mic", run);
        return;
      }
      if (!this.isCurrent(run)) return;
      const settings = d.settings();
      const api = d.api(apiKey, settings.userName);
      try {
        d.service.start();
      } catch (error) {
        // Without the foreground service the ask would stall once the screen is off; say so instead (issue #6).
        d.log("service_failed", { error: String(error) });
        await this.fail("service", run);
        return;
      }
      this.serviceRunning = true;
      const recording = await this.record(run);
      if (recording === null) return;
      const accepted = await this.send(recording, api, run);
      if (accepted === null) return;
      await this.maybeReturn("sent", settings, run);
      const result = await this.waitForAnswer(accepted.askId, recording.name, api, run);
      if (result === null) return;
      await this.speak(result, settings, run);
    } finally {
      // A newer ask (or a cancel) owns the screen state and the foreground service; leave both to it.
      if (this.isCurrent(run)) {
        this.current = null;
        this.dispatch({ type: "dismiss", now: d.now() });
        this.stopService();
      }
    }
  }

  private stopService(): void {
    if (!this.serviceRunning) return;
    this.serviceRunning = false;
    this.deps.service.stop();
  }

  private dispatch(event: FlowEvent): void {
    const next = reduce(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.deps.onState(next);
  }

  private isCurrent(run: Run): boolean {
    return run.id === this.runId;
  }

  // The press itself brought this app over the nav app, so go back once the rider has heard the message.
  private async sayBusy(): Promise<void> {
    const d = this.deps;
    const run = this.current;
    const said = d.speech.say(BUSY_MESSAGE);
    this.busySpeech = said;
    await said;
    if (this.busySpeech === said) this.busySpeech = null;
    if (!run || !this.isCurrent(run) || run.source !== "handsfree" || !run.returned) return;
    const settings = d.settings();
    if (settings.returnEnabled && settings.returnApp) await d.nav.returnTo(settings.returnApp.packageName);
  }

  private async record(run: Run): Promise<Recording | null> {
    const d = this.deps;
    d.location.begin();
    const routed = await d.route.start(run.source);
    if (!routed) this.dispatch({ type: "phoneMic", now: d.now() });
    try {
      await d.recorder.start();
    } catch {
      await d.route.stop();
      d.location.end();
      await this.fail("mic", run);
      return null;
    }
    // After the recorder is running: the rider starts talking on this cue, so nothing said after it is lost.
    d.cues.start();
    const startedAt = d.now();
    while (this.state.phase === "recording" && this.isCurrent(run) && d.now() - startedAt < RECORD_LIMIT_MS) {
      await d.sleep(TICK_MS);
    }
    if (!this.isCurrent(run)) {
      await d.recorder.cancel();
      await d.route.stop();
      d.location.end();
      return null;
    }
    // Read while the recorder still runs: the system only reports the input device of an active recording.
    const device = d.route.inputDevice();
    const phoneMic = this.state.phoneMic;
    this.stopRecording();
    let stopped: { audio: string; name: string };
    try {
      stopped = await d.recorder.stop();
    } catch {
      await d.route.stop();
      d.location.end();
      await this.fail("mic", run);
      return null;
    }
    await d.route.stop();
    d.recordings.saved({
      name: stopped.name, recordedAt: startedAt, durationMs: pcmDurationMs(base64Bytes(stopped.audio)), phoneMic, device, transcript: null,
    });
    const { current, fixes } = d.location.end();
    return { audio: stopped.audio, name: stopped.name, current, fixes };
  }

  private async send(recording: Recording, api: AskApi, run: Run): Promise<AskAccepted | null> {
    const d = this.deps;
    const body: AskBody = {
      volumeDb: d.settings().answerVolumeDb,
      audio: recording.audio,
      location: recording.current ? { latitude: recording.current.latitude, longitude: recording.current.longitude } : null,
      headingSample: recording.current ? pickHeadingSample(recording.fixes, recording.current) : null,
      conversationId: d.conversation.current(d.now()),
    };
    let accepted: AskAccepted;
    try {
      accepted = await api.postAsk(body);
    } catch (error) {
      d.log("post_failed", { kind: error instanceof ApiError ? error.kind : "unknown" });
      await this.fail(reasonFor(error), run);
      return null;
    }
    // The ask exists on the Backend either way, so keep the conversation going even if it was cancelled.
    d.conversation.update(accepted.conversationId, accepted.conversationExpiresAt);
    if (!this.isCurrent(run)) return null;
    this.dispatch({ type: "sent", askId: accepted.askId, now: d.now() });
    d.cues.sent();
    return accepted;
  }

  private async waitForAnswer(askId: string, recordingName: string, api: AskApi, run: Run): Promise<AskResult | null> {
    const d = this.deps;
    let sinceCue = 0;
    const sleep = async (ms: number) => {
      await d.sleep(ms);
      sinceCue += ms;
      if (sinceCue >= WAITING_CUE_MS && this.isCurrent(run)) {
        sinceCue = 0;
        d.cues.waiting();
      }
    };
    let outcome: AskResult | "timeout" | "cancelled";
    try {
      outcome = await pollUntilDone(() => api.getAsk(askId), { sleep, now: d.now, isCancelled: () => !this.isCurrent(run) });
    } catch (error) {
      await this.fail(reasonFor(error), run);
      return null;
    }
    if (typeof outcome === "object" && outcome.transcript !== null) d.recordings.transcribed(recordingName, outcome.transcript);
    if (outcome === "cancelled" || !this.isCurrent(run)) return null;
    if (outcome === "timeout") {
      await this.fail("timeout", run);
      return null;
    }
    const readable = outcome.status === "completed" || (outcome.error === "tts_failed" && !!outcome.answer);
    if (!readable) {
      await this.fail(failureFromServer(outcome.error), run);
      return null;
    }
    return outcome;
  }

  private async speak(result: AskResult, settings: Settings, run: Run): Promise<void> {
    const d = this.deps;
    this.dispatch({ type: "answered", answer: result.answer ?? "", now: d.now() });
    await this.maybeReturn("answered", settings, run);
    const urls = [...result.audio].sort((a, b) => a.seq - b.seq).map((a) => a.url);
    if (this.busySpeech) await this.busySpeech;
    let played = false;
    if (urls.length > 0 && this.isCurrent(run)) {
      try {
        await d.player.play(urls);
        played = true;
      } catch (error) {
        d.log("play_failed", { error: String(error) });
      }
    }
    if (!played && this.isCurrent(run) && result.answer) await d.speech.say(result.answer);
    await this.maybeReturn("spoken", settings, run);
  }

  private async maybeReturn(moment: Moment, settings: Settings, run: Run): Promise<void> {
    if (run.returned || !this.isCurrent(run) || !shouldReturnNow(run.source, settings, moment)) return;
    run.returned = true;
    await this.deps.nav.returnTo(settings.returnApp!.packageName);
  }

  private async fail(reason: FailureReason, run: Run): Promise<void> {
    const d = this.deps;
    if (!this.isCurrent(run)) return;
    this.dispatch({ type: "fail", reason, now: d.now() });
    d.cues.failure();
    await d.speech.say(spokenMessage(reason));
    if (!this.isCurrent(run)) return;
    const settings = d.settings();
    if (run.source === "handsfree") {
      // US-B-04.006: a failed answer still ends with the nav app in front.
      if (!run.returned && settings.returnEnabled && settings.returnApp) {
        run.returned = true;
        await d.nav.returnTo(settings.returnApp.packageName);
      }
      return;
    }
    let waited = 0;
    while (waited < FAILED_SCREEN_MS && this.isCurrent(run) && this.state.phase === "failed") {
      await d.sleep(TICK_MS);
      waited += TICK_MS;
    }
  }
}
