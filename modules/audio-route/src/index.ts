import { NativeModule, requireNativeModule } from "expo-modules-core";

export type RouteResult = { ok: boolean; note: string };

type Events = { onVoiceRecognitionEnded: (event: { reason: string }) => void };

declare class AudioRouteModule extends NativeModule<Events> {
  startVoiceRecognition(timeoutMs: number): Promise<RouteResult>;
  stopVoiceRecognition(reason: string): Promise<void>;
  acquireSco(timeoutMs: number): Promise<RouteResult>;
  releaseSco(): Promise<void>;
}

export default requireNativeModule<AudioRouteModule>("AudioRoute");
