import { NativeModule, requireNativeModule } from "expo-modules-core";

export type RouteResult = { ok: boolean; note: string };
export type MediaVolume = { current: number; max: number };
export type InputDevice = { type: "bluetooth" | "builtin" | "other"; name: string };

type Events = { onVoiceRecognitionEnded: (event: { reason: string }) => void };

declare class AudioRouteModule extends NativeModule<Events> {
  startVoiceRecognition(timeoutMs: number): Promise<RouteResult>;
  stopVoiceRecognition(reason: string): Promise<void>;
  acquireSco(timeoutMs: number): Promise<RouteResult>;
  releaseSco(): Promise<void>;
  // null while media still routes to the intercom's call link (the music stream then reports that link's volume).
  getMediaVolume(): MediaVolume | null;
  activeInputDevice(): InputDevice | null;
}

export default requireNativeModule<AudioRouteModule>("AudioRoute");
