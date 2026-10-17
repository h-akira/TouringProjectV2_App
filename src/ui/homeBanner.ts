// SC-02 shows one warning band at a time, the most important first (mock: 帯（警告）).
import type { MediaVolume } from "../../modules/audio-route/src";
import type { Phase } from "../ask/flow";

export type Banner = "no_key" | "no_return_app" | "low_volume";

export const BANNER_TEXT: Record<Banner, string> = {
  no_key: "接続キーが未設定です（押して設定）",
  no_return_app: "戻り先のアプリが未設定です（押して選ぶ）",
  low_volume: "メディアの音量が低く、回答が聞こえないかもしれません",
};

/** Answers and cues play on the media stream; below a third of the maximum they get lost on the intercom. */
export function mediaVolumeLow(volume: MediaVolume | null): boolean {
  return volume !== null && volume.max > 0 && volume.current * 3 < volume.max;
}

/** While an ask holds the intercom route, the music stream reports the call device's volume, not the media one. */
export function volumeReadable(phase: Phase): boolean {
  return phase === "idle" || phase === "failed";
}

/** The native side reports null while media still routes to the intercom's call link; keep the last good reading. */
export function nextVolume(previous: MediaVolume | null, reading: MediaVolume | null): MediaVolume | null {
  return reading ?? previous;
}

/** Low, and not dismissed at this very level (a dismissal lasts until the volume changes). */
export function volumeWarning(volume: MediaVolume | null, dismissedAt: number | null): boolean {
  return mediaVolumeLow(volume) && volume!.current !== dismissedAt;
}

export function homeBanner(status: { hasKey: boolean; returnAppMissing: boolean; volumeLow: boolean }): Banner | null {
  if (!status.hasKey) return "no_key";
  if (status.returnAppMissing) return "no_return_app";
  if (status.volumeLow) return "low_volume";
  return null;
}
