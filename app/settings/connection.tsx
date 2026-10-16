import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ApiClient, ApiError } from "../../src/api/client";
import { useAsk } from "../../src/ask/AskProvider";
import { API_BASE_URL } from "../../src/config";
import { maskKey } from "../../src/settings/store";

export default function Connection() {
  const { apiKey, setApiKey, settings } = useAsk();
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);

  const save = async () => {
    const key = input.trim();
    if (!key || !settings) return;
    setChecking(true);
    try {
      await new ApiClient({ baseUrl: API_BASE_URL, apiKey: key, userName: settings.userName }).checkKey();
      await setApiKey(key);
      setInput("");
      Alert.alert("保存しました");
    } catch (error) {
      const kind = error instanceof ApiError ? error.kind : "network";
      Alert.alert(kind === "invalid_key" ? "キーが正しくありません" : "サーバーに繋がりません", "元のキーのままです。");
    } finally {
      setChecking(false);
    }
  };

  const remove = () =>
    Alert.alert("接続キーを削除しますか？", "", [
      { text: "やめる", style: "cancel" },
      { text: "削除する", style: "destructive", onPress: () => void setApiKey(null) },
    ]);

  return (
    <View style={styles.root}>
      <Text style={styles.label}>接続キー</Text>
      <Text style={styles.current}>{apiKey ? maskKey(apiKey) : "未設定"}</Text>
      <Text style={styles.note}>身内で共通のキーを使ってかまいません。記録はユーザー名で分かれます。</Text>
      <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder="キーを貼り付け" autoCapitalize="none" autoCorrect={false} />
      <Pressable style={styles.button} onPress={save} disabled={checking}>
        <Text style={styles.buttonText}>{checking ? "確かめています…" : "確かめて保存"}</Text>
      </Pressable>
      {apiKey ? (
        <Pressable style={styles.danger} onPress={remove}>
          <Text style={styles.buttonText}>キーを削除</Text>
        </Pressable>
      ) : null}
      {!API_BASE_URL ? <Text style={styles.warn}>API の URL が設定されていません（.env の EXPO_PUBLIC_API_BASE_URL）</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  label: { fontSize: 16, color: "#666" },
  current: { fontSize: 20, fontFamily: "monospace" },
  note: { fontSize: 14, color: "#666" },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#1f4fd1", padding: 16, borderRadius: 12, alignItems: "center" },
  danger: { backgroundColor: "#d42a2a", padding: 16, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  warn: { color: "#d42a2a" },
});
