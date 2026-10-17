import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useAsk } from "../ask/AskProvider";
import { RECORD_LIMIT_MS } from "../ask/controller";
import { spokenMessage } from "../ask/failures";
import { BANNER_TEXT, volumeWarning } from "./homeBanner";
import { phaseColor } from "./colors";

function useSecondsSince(startedAt: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    // Foreground-only display timer; the ask loop itself never relies on JS timers.
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function AskOverlay() {
  const { state, controller, volumeDismissedAt, dismissVolumeWarning } = useAsk();
  const seconds = useSecondsSince(state.phaseStartedAt);
  if (state.phase === "idle" || !controller) return null;

  let title = "";
  let big = "";
  let detail = "";
  let button = "";
  let onMain: () => void = () => undefined;
  switch (state.phase) {
    case "recording":
      title = "話してください";
      big = String(Math.max(0, Math.ceil(RECORD_LIMIT_MS / 1000) - seconds));
      detail = "もう一度ボタンを押すか、ここを押すと送ります";
      button = "送らずにやめる";
      onMain = () => controller.stopRecording();
      break;
    case "sending":
      title = "送っています…";
      button = "送らずにやめる";
      break;
    case "waiting":
      title = "考えています…";
      big = String(seconds);
      detail = "最初の質問は10秒ほど";
      button = "待つのをやめる";
      break;
    case "speaking":
      title = "回答中";
      detail = state.answer ?? "";
      button = "読み上げを止める";
      onMain = () => controller.cancel();
      break;
    case "failed":
      title = state.failure ? spokenMessage(state.failure) : "失敗しました";
      button = "閉じる";
      break;
  }

  return (
    <Modal visible animationType="none" statusBarTranslucent navigationBarTranslucent>
      {/* A Modal is its own window: it needs its own provider to know the system bar insets. */}
      <SafeAreaProvider>
        <SafeAreaView edges={["top", "bottom", "left", "right"]} style={[styles.root, { backgroundColor: phaseColor(state.phase) }]}>
          {state.phoneMic && state.phase === "recording" ? (
            <Text style={styles.warning}>インカムのマイクに繋がっていません（本体のマイクで録音中）</Text>
          ) : null}
          {state.phase === "recording" && state.mediaVolume && volumeWarning(state.mediaVolume, volumeDismissedAt) ? (
            <View style={styles.warningRow}>
              <Text style={styles.warningText}>{BANNER_TEXT.low_volume}</Text>
              <Pressable style={styles.warningClose} onPress={() => dismissVolumeWarning(state.mediaVolume!.current)} accessibilityLabel="閉じる">
                <Text style={styles.warningCloseText}>✕</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable style={styles.main} onPress={onMain}>
            <Text style={styles.title}>{title}</Text>
            {big ? <Text style={styles.big}>{big}</Text> : null}
            {detail ? <Text style={styles.detail} numberOfLines={8}>{detail}</Text> : null}
          </Pressable>
          <Pressable style={styles.button} onPress={() => controller.cancel()}>
            <Text style={styles.buttonText}>{button}</Text>
          </Pressable>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, paddingBottom: 24, paddingTop: 16 },
  warning: { backgroundColor: "#f5c518", color: "#000", fontSize: 18, padding: 12, borderRadius: 8, marginBottom: 12 },
  warningRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#f5c518", borderRadius: 8, marginBottom: 12 },
  warningText: { flex: 1, color: "#000", fontSize: 18, padding: 12 },
  warningClose: { paddingHorizontal: 18, paddingVertical: 12 },
  warningCloseText: { color: "#000", fontSize: 22, fontWeight: "700" },
  main: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { color: "#fff", fontSize: 36, fontWeight: "700", textAlign: "center" },
  big: { color: "#fff", fontSize: 140, fontWeight: "800" },
  detail: { color: "#fff", fontSize: 22, textAlign: "center", marginTop: 16 },
  button: { borderColor: "#fff", borderWidth: 4, borderRadius: 16, paddingVertical: 22, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 26, fontWeight: "700" },
});
