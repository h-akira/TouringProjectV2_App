import { Link, router } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { useAsk } from "../src/ask/AskProvider";
import { conversationLabel } from "../src/ui/conversationLabel";

export default function Home() {
  const { ready, controller, settings, apiKey, conversationExpiresAt } = useAsk();
  if (!ready || !settings || !controller) return <View style={styles.root}><Text>準備中…</Text></View>;

  const confirmNewConversation = () =>
    Alert.alert("新しい会話を始めますか？", "次の質問から、これまでの会話を踏まえずに答えます。", [
      { text: "やめる", style: "cancel" },
      { text: "新しい会話にする", onPress: () => controller.resetConversation() },
    ]);

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
      {!apiKey ? (
        <Pressable style={styles.banner} onPress={() => router.push("/settings/connection")}>
          <Text style={styles.bannerText}>接続キーが未設定です（押して設定）</Text>
        </Pressable>
      ) : null}
      {settings.returnEnabled && !settings.returnApp ? (
        <Pressable style={styles.banner} onPress={() => router.push("/settings/return-app")}>
          <Text style={styles.bannerText}>戻り先のアプリが未設定です（押して選ぶ）</Text>
        </Pressable>
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
  banner: { backgroundColor: "#f5c518", padding: 12, borderRadius: 8 },
  bannerText: { fontSize: 16, color: "#000" },
  ready: { fontSize: 16, color: "#13804a" },
  newConversation: { minHeight: 76, maxHeight: 140, borderRadius: 16, backgroundColor: "#1f4fd1", padding: 16, justifyContent: "center" },
  newStatus: { color: "#fff", fontSize: 16 },
  newText: { color: "#fff", fontSize: 26, fontWeight: "700", marginTop: 6 },
});
