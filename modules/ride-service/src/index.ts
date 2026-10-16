import { requireNativeModule } from "expo-modules-core";

export type LaunchableApp = { packageName: string; label: string };
export type ToneName = "dial" | "ack" | "beep" | "error";

declare class RideServiceModule {
  startService(): void;
  stopService(): void;
  sleep(ms: number): Promise<void>;
  launchApp(packageName: string): Promise<boolean>;
  listLaunchableApps(): Promise<LaunchableApp[]>;
  playTone(name: ToneName, durationMs: number, stream: "call" | "music"): boolean;
}

export default requireNativeModule<RideServiceModule>("RideService");
