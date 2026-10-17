// Real implementations of the controller's Deps. Kept thin: the decisions live in controller.ts.
import { createAudioPlayer, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import AudioModule from "expo-audio/build/AudioModule";
import { cacheDirectory, deleteAsync, readAsStringAsync } from "expo-file-system/legacy";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { PermissionsAndroid } from "react-native";

import AudioRoute from "../../modules/audio-route/src";
import RideService from "../../modules/ride-service/src";
import { ApiClient } from "../api/client";
import { API_BASE_URL } from "../config";
import { Fix } from "../location/heading";
import { PositionTracker } from "../location/tracker";
import type { Settings } from "../settings/store";
import { Deps } from "./controller";
import { ConversationState } from "./conversation";
import { FlowState, Source } from "./flow";
import { ClipPlayer, playClips } from "./playback";
import { newRecordingUri, pruneRecordings, recordingUri, saveMeta, setTranscript, wavFromPcm } from "./recordingFiles";
import { TrialDeps, TrialState } from "./trial";
const VR_TIMEOUT_MS = 4000;
const SCO_TIMEOUT_MS = 3000;
// Intercoms drop the first part of a sound: a 1 s tone is heard as a short blip, so the start cue is longer.
const START_CUE_MS = 1500;

export async function requestPermissions(): Promise<void> {
  await requestRecordingPermissionsAsync();
  await Location.requestForegroundPermissionsAsync();
  await PermissionsAndroid.requestMultiple([
    "android.permission.BLUETOOTH_CONNECT",
    "android.permission.POST_NOTIFICATIONS",
  ] as Parameters<typeof PermissionsAndroid.requestMultiple>[0]);
}

// 16 kHz mono 16-bit PCM into a file (adr/0002). Shared by questions and the trial recording on SC-12.
export class PcmStream {
  private stream: InstanceType<typeof AudioModule.AudioStream> | null = null;

  async start(uri: string): Promise<void> {
    const stream = new AudioModule.AudioStream({ sampleRate: 16000, channels: 1, encoding: "int16" });
    await stream.start();
    await stream.startFileRecordingAsync({ uri, format: "pcm" });
    this.stream = stream;
  }

  /** Stops and returns the file's URI. */
  async stop(): Promise<string> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) throw new Error("not recording");
    const file = await stream.stopFileRecordingAsync();
    stream.stop();
    return file.uri;
  }

  async cancel(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return;
    const file = await stream.stopFileRecordingAsync().catch(() => null);
    stream.stop();
    if (file) await deleteAsync(file.uri, { idempotent: true });
  }
}

// Questions are kept (the newest ten) for SC-12.
class AskRecorder {
  private readonly stream = new PcmStream();
  private name: string | null = null;

  async start(): Promise<void> {
    const target = await newRecordingUri(Date.now());
    await this.stream.start(target.uri);
    this.name = target.name;
  }

  async stop(): Promise<{ audio: string; name: string }> {
    const uri = await this.stream.stop();
    const name = this.name!;
    this.name = null;
    const audio = await readAsStringAsync(uri, { encoding: "base64" });
    await pruneRecordings();
    return { audio, name };
  }

  async cancel(): Promise<void> {
    this.name = null;
    await this.stream.cancel();
  }
}

function toFix(p: Location.LocationObject): Fix {
  return { latitude: p.coords.latitude, longitude: p.coords.longitude, timestamp: p.timestamp, accuracy: p.coords.accuracy ?? null };
}

function createPositionTracker(): PositionTracker {
  return new PositionTracker({
    now: () => Date.now(),
    lastKnown: async () => {
      const p = await Location.getLastKnownPositionAsync();
      return p ? toFix(p) : null;
    },
    watch: (onFix) =>
      Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (p) => onFix(toFix(p))),
  });
}

export function createRuntimeDeps(options: {
  settings(): Settings;
  apiKey(): string | null;
  onState(state: FlowState): void;
}): {
  deps: Deps;
  trialDeps(onState: (state: TrialState) => void): TrialDeps;
  playRecording(name: string): Promise<void>;
  stopPlayback(): void;
  dispose(): void;
} {
  // setAudioModeAsync also calls setSpeakerphoneOn(), which pins this app's output to the phone speaker and keeps
  // answers off the intercom; clear that right after (releaseSco clears the communication device and the mode).
  void setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: "mixWithOthers" }).then(() =>
    AudioRoute.releaseSco(),
  );
  const recorder = new AskRecorder();
  const positions = createPositionTracker();
  const playback: { stop: (() => void) | null } = { stop: null };
  let routeSource: Source | null = null;

  const deps: Deps = {
    now: () => Date.now(),
    sleep: (ms) => RideService.sleep(ms),
    settings: options.settings,
    micAllowed: async () => (await getRecordingPermissionsAsync()).granted,
    apiKey: () => (API_BASE_URL ? options.apiKey() : null),
    api: (apiKey, userName) =>
      new ApiClient({ baseUrl: API_BASE_URL, apiKey, userName, sleep: (ms) => RideService.sleep(ms), timer: (ms) => RideService.sleep(ms) }),
    conversation: new ConversationState(),
    route: {
      start: async (source) => {
        routeSource = source;
        const result = source === "handsfree" ? await AudioRoute.startVoiceRecognition(VR_TIMEOUT_MS) : await AudioRoute.acquireSco(SCO_TIMEOUT_MS);
        console.log(JSON.stringify({ event: "route", source, ok: result.ok, note: result.note }));
        return result.ok;
      },
      stop: async () => {
        if (routeSource === "handsfree") await AudioRoute.stopVoiceRecognition("done");
        else await AudioRoute.releaseSco();
        routeSource = null;
      },
      inputDevice: () => AudioRoute.activeInputDevice(),
    },
    recorder,
    recordings: {
      saved: (meta) => { void saveMeta(meta).catch((e) => console.log(JSON.stringify({ event: "meta_failed", error: String(e) }))); },
      transcribed: (name, transcript) => {
        void setTranscript(name, transcript).catch((e) => console.log(JSON.stringify({ event: "meta_failed", error: String(e) })));
      },
    },
    location: positions,
    service: { start: () => RideService.startService(), stop: () => RideService.stopService() },
    nav: { returnTo: (packageName) => RideService.launchApp(packageName) },
    cues: {
      start: () => { console.log(JSON.stringify({ event: "cue", cue: "start", ok: RideService.playTone("dial", START_CUE_MS, "call") })); },
      sent: () => { console.log(JSON.stringify({ event: "cue", cue: "sent", ok: RideService.playTone("ack", 800, "music") })); },
      waiting: () => { console.log(JSON.stringify({ event: "cue", cue: "waiting", ok: RideService.playTone("beep", 600, "music") })); },
      failure: () => { console.log(JSON.stringify({ event: "cue", cue: "failure", ok: RideService.playTone("error", 1200, "music") })); },
    },
    player: {
      play: (urls) =>
        playClips(urls, { create: (uri) => createAudioPlayer({ uri }) as unknown as ClipPlayer, sleep: (ms) => RideService.sleep(ms) }, playback),
      stop: () => playback.stop?.(),
    },
    speech: {
      say: (text) =>
        new Promise<void>((resolve) => {
          Speech.speak(text, { language: "ja-JP", onDone: () => resolve(), onStopped: () => resolve(), onError: () => resolve() });
        }),
      stop: () => { void Speech.stop(); },
    },
    onState: (state) => {
      console.log(JSON.stringify({ event: "phase", phase: state.phase, source: state.source, failure: state.failure, phoneMic: state.phoneMic }));
      options.onState(state);
    },
    log: (event, data) => { console.log(JSON.stringify({ event, ...data })); },
  };
  // SC-12 plays WAV copies; expo-audio cannot play the raw PCM that is kept and sent.
  const playPcm = async (pcmUri: string, wavName: string) => deps.player.play([await wavFromPcm(pcmUri, wavName)]);
  const trialStream = new PcmStream();
  const trialDeps = (onState: (state: TrialState) => void): TrialDeps => ({
    now: deps.now,
    sleep: deps.sleep,
    micAllowed: deps.micAllowed,
    route: { start: () => deps.route.start("screen"), stop: () => deps.route.stop(), inputDevice: deps.route.inputDevice },
    recorder: { start: () => trialStream.start(`${cacheDirectory}trial.pcm`), stop: () => trialStream.stop(), cancel: () => trialStream.cancel() },
    cueStart: deps.cues.start,
    play: (uri) => playPcm(uri, "trial.wav"),
    stopPlayback: deps.player.stop,
    discard: (uri) => deleteAsync(uri, { idempotent: true }),
    onState,
  });
  return {
    deps,
    trialDeps,
    playRecording: (name) => playPcm(recordingUri(name), "recording.wav"),
    stopPlayback: deps.player.stop,
    dispose: () => { positions.end(); playback.stop?.(); },
  };
}
