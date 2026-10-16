import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAsk } from "../../src/ask/AskProvider";
import { USER_NAME_RE } from "../../src/settings/store";

export default function User() {
  const { settings, updateSettings } = useAsk();
  const [input, setInput] = useState("");
  if (!settings) return null;

  const change = () => {
    const name = input.trim();
    if (!USER_NAME_RE.test(name)) {
      Alert.alert("英小文字と数字の3〜20文字にしてください");
      return;
    }
    Alert.alert(
      `「${name}」に変えますか？`,
      "今の記録は引き継ぎません。元の名前に戻せば、また見られます。同じ名前の記録が既にあれば、その記録に切り替わります。",
      [
        { text: "やめる", style: "cancel" },
        { text: "変える", onPress: () => { void updateSettings({ ...settings, userName: name }); setInput(""); } },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>今のユーザー名</Text>
      <Text style={styles.name}>{settings.userName}</Text>
      <Text style={styles.note}>別の端末に記録を引き継ぐときに使います。控えておいてください。</Text>
      <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder="新しいユーザー名" autoCapitalize="none" autoCorrect={false} />
      <Pressable style={styles.button} onPress={change}>
        <Text style={styles.buttonText}>変更する</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  label: { fontSize: 16, color: "#666" },
  name: { fontSize: 32, fontFamily: "monospace", fontWeight: "700" },
  note: { fontSize: 14, color: "#666" },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#1f4fd1", padding: 16, borderRadius: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
