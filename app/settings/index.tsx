import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAsk } from "../../src/ask/AskProvider";
import { maskKey } from "../../src/settings/store";

function Row({ title, value, href }: { title: string; value: string; href: "/settings/connection" | "/settings/user" | "/settings/return-app" }) {
  return (
    <Pressable style={styles.row} onPress={() => router.push(href)}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
    </Pressable>
  );
}

export default function SettingsIndex() {
  const { settings, apiKey } = useAsk();
  if (!settings) return null;
  const returnValue = !settings.returnEnabled ? "戻らない" : settings.returnApp?.label ?? "未設定";
  return (
    <View style={styles.root}>
      <Row title="接続の設定" value={apiKey ? maskKey(apiKey) : "未設定"} href="/settings/connection" />
      <Row title="ユーザー名" value={settings.userName} href="/settings/user" />
      <Row title="応答後に戻るアプリ" value={returnValue} href="/settings/return-app" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 8 },
  row: { padding: 18, borderRadius: 12, borderWidth: 1, borderColor: "#ccc", flexDirection: "row", justifyContent: "space-between" },
  title: { fontSize: 18 },
  value: { fontSize: 18, color: "#666" },
});
