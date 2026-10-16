// Real implementations of the controller's Deps. Kept thin: the decisions live in controller.ts.
import { createAudioPlayer, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import AudioModule from "expo-audio/build/AudioModule";
import { deleteAsync, documentDirectory, makeDirectoryAsync, readAsStringAsync, readDirectoryAsync } from "expo-file-system/legacy";
import * as Location from "expo-location";
import * as Speech from "expo-speech";
import { PermissionsAndroid } from "react-native";

import AudioRoute from "../../modules/audio-route/src";
import RideService from "../../modules/ride-service/src";
import { ApiClient } from "../api/client";
import { API_BASE_URL } from "../config";
import { Fix } from "../location/heading";
import type { Settings } from "../settings/store";
import { Deps } from "./controller";
import { ConversationState } from "./conversation";
import { FlowState, Source } from "./flow";
import { ClipPlayer, playClips } from "./playback";
import { recordingName, recordingsToDelete } from "./recordings";

const RECORDINGS_DIR = `${documentDirectory}recordings/`;
const VR_TIMEOUT_MS = 4000;
const SCO_TIMEOUT_MS = 3000;

export async function requestPermissions(): Promise<void> {
  await requestRecordingPermissionsAsync();
  await Location.requestForegroundPermissionsAsync();
  await PermissionsAndroid.requestMultiple([
    "android.permission.BLUETOOTH_CONNECT",
    "android.permission.POST_NOTIFICATIONS",
  ] as Parameters<typeof PermissionsAndroid.requestMultiple>[0]);
}

class PcmRecorder {
  private stream: InstanceType<typeof AudioModule.AudioStream> | null = null;

  async start(): Promise<void> {
    await makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
    const stream = new AudioModule.AudioStream({ sampleRate: 16000, channels: 1, encoding: "int16" });
    await stream.start();
    await stream.startFileRecordingAsync({ uri: `${RECORDINGS_DIR}${recordingName(Date.now())}`, format: "pcm" });
    this.stream = stream;
  }

  async stop(): Promise<string> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) throw new Error("not recording");
    const file = await stream.stopFileRecordingAsync();
    stream.stop();
    const base64 = await readAsStringAsync(file.uri, { encoding: "base64" });
    await this.prune();
    return base64;
  }

  async cancel(): Promise<void> {
    const stream = this.stream;
    this.stream = null;
    if (!stream) return;
    const file = await stream.stopFileRecordingAsync().catch(() => null);
    stream.stop();
    if (file) await deleteAsync(file.uri, { idempotent: true });
  }

  private async prune(): Promise<void> {
    const names = await readDirectoryAsync(RECORDINGS_DIR);
    await Promise.all(recordingsToDelete(names).map((name) => deleteAsync(`${RECORDINGS_DIR}${name}`, { idempotent: true })));
  }
}

class PositionTracker {
  private fixes: Fix[] = [];
  private subscription: Location.LocationSubscription | null = null;

  begin(): void {
    this.fixes = [];
    void Location.getLastKnownPositionAsync().then((p) => p && this.add(p));
    void Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 }, (p) => this.add(p))
      .then((s) => { this.subscription = s; })
      .catch(() => undefined);
  }

  end(): { current: Fix | null; fixes: Fix[] } {
    this.subscription?.remove();
    this.subscription = null;
    const fixes = [...this.fixes].sort((a, b) => a.timestamp - b.timestamp);
    return { current: fixes.length > 0 ? fixes[fixes.length - 1] : null, fixes };
  }

  private add(p: Location.LocationObject): void {
    this.fixes.push({ latitude: p.coords.latitude, longitude: p.coords.longitude, timestamp: p.timestamp });
  }
}

export function createRuntimeDeps(options: {
  settings(): Settings;
  apiKey(): string | null;
  onState(state: FlowState): void;
}): { deps: Deps; dispose(): void } {
  void setAudioModeAsync({ shouldPlayInBackground: true, playsInSilentMode: true, interruptionMode: "mixWithOthers" });
  const recorder = new PcmRecorder();
  const positions = new PositionTracker();
  const playback: { stop: (() => void) | null } = { stop: null };
  let routeSource: Source | null = null;

  const deps: Deps = {
    now: () => Date.now(),
    sleep: (ms) => RideService.sleep(ms),
    settings: options.settings,
    apiKey: () => (API_BASE_URL ? options.apiKey() : null),
    api: (apiKey, userName) => new ApiClient({ baseUrl: API_BASE_URL, apiKey, userName, sleep: (ms) => RideService.sleep(ms) }),
    conversation: new ConversationState(),
    route: {
      start: async (source) => {
        routeSource = source;
        const result = source === "handsfree" ? await AudioRoute.startVoiceRecognition(VR_TIMEOUT_MS) : await AudioRoute.acquireSco(SCO_TIMEOUT_MS);
        return result.ok;
      },
      stop: async () => {
        if (routeSource === "handsfree") await AudioRoute.stopVoiceRecognition("done");
        else await AudioRoute.releaseSco();
        routeSource = null;
      },
    },
    recorder,
    location: positions,
    service: { start: () => RideService.startService(), stop: () => RideService.stopService() },
    nav: { returnTo: (packageName) => RideService.launchApp(packageName) },
    cues: {
      start: () => { RideService.playTone("dial", 1000, "call"); },
      sent: () => { RideService.playTone("ack", 200, "music"); },
      waiting: () => { RideService.playTone("beep", 120, "music"); },
      failure: () => { RideService.playTone("error", 600, "music"); },
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
    onState: options.onState,
    log: (event, data) => { console.log(JSON.stringify({ event, ...data })); },
  };
  return { deps, dispose: () => { positions.end(); playback.stop?.(); } };
}
