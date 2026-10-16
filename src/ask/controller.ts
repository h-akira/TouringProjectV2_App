// Orchestrates one ask: record -> send -> (return to nav) -> wait -> speak. All side effects come in through Deps
// so the whole loop is testable; waits use deps.sleep, which is native in the app (setTimeout stops in the background).
import { ApiError, AskAccepted, AskBody, AskResult } from "../api/client";
import type { Settings } from "../settings/store";
import { Fix, pickHeadingSample } from "../location/heading";
import { ConversationState } from "./conversation";
import { BUSY_MESSAGE, failureFromServer, spokenMessage } from "./failures";
import { FailureReason, FlowEvent, FlowState, IDLE, isBusy, Moment, reduce, shouldReturnNow, Source } from "./flow";
import { pollUntilDone } from "./polling";

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
  api(apiKey: string, userName: string): AskApi;
  conversation: ConversationState;
  route: { start(source: Source): Promise<boolean>; stop(): Promise<void> };
  recorder: { start(): Promise<void>; stop(): Promise<string>; cancel(): Promise<void> };
  location: { begin(): void; end(): { current: Fix | null; fixes: Fix[] } };
  service: { start(): void; stop(): void };
  nav: { returnTo(packageName: string): Promise<boolean> };
  cues: { start(): void; sent(): void; waiting(): void; failure(): void };
  player: { play(urls: string[]): Promise<void>; stop(): void };
  speech: { say(text: string): Promise<void>; stop(): void };
  onState(state: FlowState): void;
  log(event: string, data?: Record<string, unknown>): void;
};

type Recording = { audio: string; current: Fix | null; fixes: Fix[] };

function reasonFor(error: unknown): FailureReason {
  if (error instanceof ApiError) {
    if (error.kind === "invalid_key") return "invalid_key";
    if (error.kind === "bad_request") return "no_speech";
  }
  return "network";
}

export class AskController {
  state: FlowState = IDLE;
  private cancelled = false;
  private returned = false;
  private runId = 0;

  constructor(private readonly deps: Deps) {}

  /** The intercom button: start, stop the recording, or say that an answer is on its way. */
  press(): void {
    if (this.state.phase === "recording") {
      this.stopRecording();
    } else if (isBusy(this.state)) {
      void this.deps.speech.say(BUSY_MESSAGE);
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

  cancel(): void {
    if (this.state.phase === "idle") return;
    this.cancelled = true;
    this.deps.player.stop();
    this.deps.speech.stop();
  }

  resetConversation(): void {
    this.deps.conversation.reset();
  }

  async run(source: Source): Promise<void> {
    const d = this.deps;
    const id = ++this.runId;
    this.cancelled = false;
    this.returned = false;
    this.dispatch({ type: "start", source, now: d.now() });
    let serviceStarted = false;
    try {
      const apiKey = d.apiKey();
      if (!apiKey) {
        await this.fail("no_key", id);
        return;
      }
      const settings = d.settings();
      const api = d.api(apiKey, settings.userName);
      d.service.start();
      serviceStarted = true;
      const recording = await this.record(source, id);
      if (recording === null) return;
      const accepted = await this.send(recording, api, id);
      if (accepted === null) return;
      await this.maybeReturn("sent", settings);
      const result = await this.waitForAnswer(accepted.askId, api, id);
      if (result === null) return;
      await this.speak(result, settings);
    } finally {
      // A newer run owns the screen state and the foreground service; leave both to it.
      if (id === this.runId) {
        this.dispatch({ type: "dismiss", now: d.now() });
        if (serviceStarted) d.service.stop();
      }
    }
  }

  private dispatch(event: FlowEvent): void {
    const next = reduce(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.deps.onState(next);
  }

  private isCurrent(id: number): boolean {
    return id === this.runId && !this.cancelled;
  }

  private async record(source: Source, id: number): Promise<Recording | null> {
    const d = this.deps;
    d.location.begin();
    const routed = await d.route.start(source);
    if (!routed) this.dispatch({ type: "phoneMic", now: d.now() });
    d.cues.start();
    try {
      await d.recorder.start();
    } catch {
      await d.route.stop();
      d.location.end();
      await this.fail("mic", id);
      return null;
    }
    const startedAt = d.now();
    while (this.state.phase === "recording" && this.isCurrent(id) && d.now() - startedAt < RECORD_LIMIT_MS) {
      await d.sleep(TICK_MS);
    }
    if (!this.isCurrent(id)) {
      await d.recorder.cancel();
      await d.route.stop();
      d.location.end();
      return null;
    }
    this.stopRecording();
    let audio: string;
    try {
      audio = await d.recorder.stop();
    } catch {
      await d.route.stop();
      d.location.end();
      await this.fail("mic", id);
      return null;
    }
    await d.route.stop();
    const { current, fixes } = d.location.end();
    return { audio, current, fixes };
  }

  private async send(recording: Recording, api: AskApi, id: number): Promise<AskAccepted | null> {
    const d = this.deps;
    const body: AskBody = {
      audio: recording.audio,
      location: recording.current ? { latitude: recording.current.latitude, longitude: recording.current.longitude } : null,
      headingSample: recording.current ? pickHeadingSample(recording.fixes, recording.current) : null,
      conversationId: d.conversation.current(d.now()),
    };
    try {
      const accepted = await api.postAsk(body);
      d.conversation.update(accepted.conversationId, accepted.conversationExpiresAt);
      this.dispatch({ type: "sent", askId: accepted.askId, now: d.now() });
      d.cues.sent();
      return accepted;
    } catch (error) {
      d.log("post_failed", { kind: error instanceof ApiError ? error.kind : "unknown" });
      await this.fail(reasonFor(error), id);
      return null;
    }
  }

  private async waitForAnswer(askId: string, api: AskApi, id: number): Promise<AskResult | null> {
    const d = this.deps;
    let sinceCue = 0;
    const sleep = async (ms: number) => {
      await d.sleep(ms);
      sinceCue += ms;
      if (sinceCue >= WAITING_CUE_MS) {
        sinceCue = 0;
        d.cues.waiting();
      }
    };
    let outcome: AskResult | "timeout" | "cancelled";
    try {
      outcome = await pollUntilDone(() => api.getAsk(askId), { sleep, now: d.now, isCancelled: () => !this.isCurrent(id) });
    } catch (error) {
      await this.fail(reasonFor(error), id);
      return null;
    }
    if (outcome === "cancelled") return null;
    if (outcome === "timeout") {
      await this.fail("timeout", id);
      return null;
    }
    const readable = outcome.status === "completed" || (outcome.error === "tts_failed" && !!outcome.answer);
    if (!readable) {
      await this.fail(failureFromServer(outcome.error), id);
      return null;
    }
    return outcome;
  }

  private async speak(result: AskResult, settings: Settings): Promise<void> {
    const d = this.deps;
    this.dispatch({ type: "answered", answer: result.answer ?? "", now: d.now() });
    await this.maybeReturn("answered", settings);
    const urls = [...result.audio].sort((a, b) => a.seq - b.seq).map((a) => a.url);
    let played = false;
    if (urls.length > 0) {
      try {
        await d.player.play(urls);
        played = true;
      } catch (error) {
        d.log("play_failed", { error: String(error) });
      }
    }
    if (!played && !this.cancelled && result.answer) await d.speech.say(result.answer);
    if (!this.cancelled) await this.maybeReturn("spoken", settings);
  }

  private async maybeReturn(moment: Moment, settings: Settings): Promise<void> {
    if (this.returned || this.cancelled || !shouldReturnNow(this.state.source, settings, moment)) return;
    this.returned = true;
    await this.deps.nav.returnTo(settings.returnApp!.packageName);
  }

  private async fail(reason: FailureReason, id: number): Promise<void> {
    const d = this.deps;
    this.dispatch({ type: "fail", reason, now: d.now() });
    d.cues.failure();
    await d.speech.say(spokenMessage(reason));
    const settings = d.settings();
    if (this.state.source === "handsfree") {
      // US-B-04.006: a failed answer still ends with the nav app in front.
      if (!this.returned && settings.returnEnabled && settings.returnApp) {
        this.returned = true;
        await d.nav.returnTo(settings.returnApp.packageName);
      }
      return;
    }
    let waited = 0;
    while (waited < FAILED_SCREEN_MS && this.isCurrent(id) && this.state.phase === "failed") {
      await d.sleep(TICK_MS);
      waited += TICK_MS;
    }
  }
}
