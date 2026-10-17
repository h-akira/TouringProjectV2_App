import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAsk } from "../../src/ask/AskProvider";
import { VOLUME_DB_CHOICES } from "../../src/settings/store";

// SC-21: how much the Backend raises the answer audio. Takes effect from the next question.
export default function Volume() {
  const { settings, updateSettings } = useAsk();
  if (!settings) return null;
  return (
    <View style={styles.root}>
      <Text style={styles.title}>回答の音声を上げる量</Text>
      <Text style={styles.note}>ナビの案内や音楽より小さく聞こえるときに上げます。次の質問から変わります。</Text>
      <View style={styles.choices}>
        {VOLUME_DB_CHOICES.map((db) => (
          <Pressable key={db} style={[styles.choice, settings.answerVolumeDb === db && styles.choiceOn]} onPress={() => void updateSettings({ ...settings, answerVolumeDb: db })}>
            <Text style={settings.answerVolumeDb === db ? styles.choiceTextOn : styles.choiceText}>+{db}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>単位は dB です。+6 でおよそ2倍、+12 でおよそ4倍の大きさです。全体が小さいときは、まずスマホのメディアの音量を上げてください。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 18 },
  note: { fontSize: 14, color: "#666" },
  choices: { flexDirection: "row", gap: 6 },
  choice: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 2, borderColor: "#ccc", alignItems: "center", justifyContent: "center" },
  choiceOn: { borderColor: "#1f4fd1", backgroundColor: "#e6edfb" },
  choiceText: { fontSize: 16, fontWeight: "700" },
  choiceTextOn: { fontSize: 16, fontWeight: "700", color: "#1f4fd1" },
});
