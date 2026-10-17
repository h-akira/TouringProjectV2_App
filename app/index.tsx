import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import AudioRoute, { MediaVolume } from "../modules/audio-route/src";
import { useAsk } from "../src/ask/AskProvider";
import { conversationLabel } from "../src/ui/conversationLabel";
import { Banner, BANNER_TEXT, homeBanner, nextVolume, volumeReadable, volumeWarning } from "../src/ui/homeBanner";

const VOLUME_CHECK_MS = 2_000;

// The rider may turn the volume down at any time; check while the home screen is in front (foreground-only timer).
// The ask screen covers home without taking its focus, so reading stops while an ask holds the route and resumes
// at once when it ends; otherwise a call-device reading would linger on home after the ask.
function useMediaVolume(readable: boolean): MediaVolume | null {
  const [volume, setVolume] = useState<MediaVolume | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!readable) return undefined;
      const read = () => setVolume((prev) => nextVolume(prev, AudioRoute.getMediaVolume()));
      read();
      const id = setInterval(read, VOLUME_CHECK_MS);
      return () => clearInterval(id);
    }, [readable]),
  );
  return volume;
}

const BANNER_TARGET: Record<Banner, "/settings/connection" | "/settings/return-app" | null> = {
  no_key: "/settings/connection",
  no_return_app: "/settings/return-app",
  low_volume: null,
};

export default function Home() {
  const { ready, state, controller, settings, apiKey, conversationExpiresAt, volumeDismissedAt, dismissVolumeWarning } = useAsk();
  const volume = useMediaVolume(volumeReadable(state.phase));
  if (!ready || !settings || !controller) return <View style={styles.root}><Text>準備中…</Text></View>;

  const confirmNewConversation = () =>
    Alert.alert("新しい会話を始めますか？", "次の質問から、これまでの会話を踏まえずに答えます。", [
      { text: "やめる", style: "cancel" },
      { text: "新しい会話にする", onPress: () => controller.resetConversation() },
    ]);
  const banner = homeBanner({
    hasKey: !!apiKey,
    returnAppMissing: settings.returnEnabled && !settings.returnApp,
    volumeLow: volumeWarning(volume, volumeDismissedAt),
  });
  const target = banner ? BANNER_TARGET[banner] : null;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.push("/settings/user")}>
          <Text style={styles.user}>{settings.userName}</Text>
        </Pressable>
        <View style={styles.row}>
          <Pressable style={styles.small} onPress={() => controller.tapToTalk()}>
            <Text style={styles.smallText}>🎤 押して話す</Text>
          </Pressable>
          <Link href="/settings" style={styles.small}>
            <Text style={styles.smallText}>⚙ 設定</Text>
          </Link>
        </View>
      </View>
      {banner ? (
        <View style={styles.bannerRow}>
          <Pressable style={styles.bannerMain} disabled={!target} onPress={() => target && router.push(target)}>
            <Text style={styles.bannerText}>{BANNER_TEXT[banner]}</Text>
          </Pressable>
          {banner === "low_volume" && volume ? (
            <Pressable style={styles.bannerClose} onPress={() => dismissVolumeWarning(volume.current)} accessibilityLabel="閉じる">
              <Text style={styles.bannerText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Text style={styles.ready}>インカムのボタンで話せます</Text>
      <Pressable style={styles.newConversation} onPress={confirmNewConversation}>
        <Text style={styles.newStatus}>{conversationLabel(conversationExpiresAt, Date.now())}</Text>
        <Text style={styles.newText}>新しい会話を始める</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  user: { fontSize: 22, fontWeight: "700", fontFamily: "monospace" },
  row: { flexDirection: "row", gap: 8 },
  small: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#999" },
  smallText: { fontSize: 14 },
  bannerRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5c518", borderRadius: 8 },
  bannerMain: { flex: 1, padding: 12 },
  bannerClose: { paddingHorizontal: 16, paddingVertical: 12 },
  bannerText: { fontSize: 16, color: "#000" },
  ready: { fontSize: 16, color: "#13804a" },
  newConversation: { minHeight: 76, maxHeight: 140, borderRadius: 16, backgroundColor: "#1f4fd1", padding: 16, justifyContent: "center" },
  newStatus: { color: "#fff", fontSize: 16 },
  newText: { color: "#fff", fontSize: 26, fontWeight: "700", marginTop: 6 },
});
