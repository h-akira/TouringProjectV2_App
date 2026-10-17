// SC-02 shows one warning band at a time, the most important first (mock: 帯（警告）).
import type { MediaVolume } from "../../modules/audio-route/src";

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

export function homeBanner(status: { hasKey: boolean; returnAppMissing: boolean; volumeLow: boolean }): Banner | null {
  if (!status.hasKey) return "no_key";
  if (status.returnAppMissing) return "no_return_app";
  if (status.volumeLow) return "low_volume";
  return null;
}
