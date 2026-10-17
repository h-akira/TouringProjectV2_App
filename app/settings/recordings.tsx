import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useAsk } from "../../src/ask/AskProvider";
import { isBusy } from "../../src/ask/flow";
import { deleteAllRecordings, listRecordings } from "../../src/ask/recordingFiles";
import { micLabel, RecordingMeta } from "../../src/ask/recordings";
import { durationLabel, recordedAtLabel, transcriptLabel } from "../../src/ui/recordingLabel";

// SC-12: the trial recording, and the kept recordings of questions with what was heard (spec §5.5).
export default function Recordings() {
  const { state, trial, trialState, playRecording, stopPlayback } = useAsk();
  const [items, setItems] = useState<RecordingMeta[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  // The player is shared with the ask loop: on leaving, stop it only if this screen is the one playing.
  const playingRef = useRef(false);

  const reload = useCallback(() => { void listRecordings().then(setItems).catch(() => setItems([])); }, []);
  useFocusEffect(
    useCallback(() => {
      reload();
      return () => {
        trial?.cancel();
        if (playingRef.current) stopPlayback();
      };
    }, [reload, trial, stopPlayback]),
  );
  if (!trial) return null;

  const busy = isBusy(state) || playing !== null;
  const play = async (name: string) => {
    setPlaying(name);
    playingRef.current = true;
    try {
      await playRecording(name);
    } catch {
      Alert.alert("再生できませんでした");
    } finally {
      playingRef.current = false;
      setPlaying(null);
    }
  };
  const confirmDeleteAll = () =>
    Alert.alert("録音をすべて消しますか？", "端末に残した質問の音声を消します。質問と回答の記録は消えません。", [
      { text: "やめる", style: "cancel" },
      { text: "消す", style: "destructive", onPress: () => void deleteAllRecordings().then(reload) },
    ]);

  let trialButton = "試し録り";
  let trialStatus = "質問と同じマイクで録って、すぐに再生します。送りません。";
  if (trialState.phase === "recording") {
    trialButton = "止めて聞く";
    trialStatus = "録音中です。話してください（インカムのボタンでも止められます）";
  } else if (trialState.phase === "playing") {
    trialButton = "再生を止める";
    trialStatus = `再生中: ${micLabel(trialState)}`;
  } else if (trialState.device || trialState.phoneMic) {
    trialStatus = `録ったマイク: ${micLabel(trialState)}`;
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Pressable
          style={[styles.trialButton, trialState.phase === "recording" && styles.trialButtonRecording, busy && !trial.active && styles.disabled]}
          disabled={busy && !trial.active}
          onPress={() => (trial.active ? trial.stop() : void trial.start())}
        >
          <Text style={styles.trialButtonText}>{trialButton}</Text>
        </Pressable>
        <Text style={styles.note}>{trialStatus}</Text>
        {trialState.error ? <Text style={styles.error}>{trialState.error}</Text> : null}
      </View>
      <Text style={styles.section}>送った録音（直近10件）</Text>
      <FlatList
        data={items}
        keyExtractor={(m) => m.name}
        ListEmptyComponent={<Text style={styles.note}>まだありません</Text>}
        renderItem={({ item }) => {
          const heard = transcriptLabel(item.transcript);
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{recordedAtLabel(item.recordedAt)}　{durationLabel(item.durationMs)}</Text>
                <Text style={styles.note}>{micLabel(item)}</Text>
                <Text style={heard.failed ? styles.error : styles.heard}>{heard.text}</Text>
              </View>
              <Pressable
                style={[styles.play, (busy || trial.active) && playing !== item.name && styles.disabled]}
                disabled={(busy || trial.active) && playing !== item.name}
                onPress={() => (playing === item.name ? stopPlayback() : void play(item.name))}
              >
                <Text style={styles.playText}>{playing === item.name ? "■" : "▶"}</Text>
              </Pressable>
            </View>
          );
        }}
      />
      <Pressable style={[styles.deleteAll, (busy || trial.active) && styles.disabled]} disabled={busy || trial.active} onPress={confirmDeleteAll}>
        <Text style={styles.deleteAllText}>録音をすべて消す</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12 },
  card: { gap: 8 },
  trialButton: { backgroundColor: "#1f4fd1", padding: 18, borderRadius: 12, alignItems: "center" },
  trialButtonRecording: { backgroundColor: "#d42a2a" },
  trialButtonText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  note: { fontSize: 14, color: "#666" },
  error: { fontSize: 14, color: "#d42a2a" },
  section: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16 },
  heard: { fontSize: 15 },
  play: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: "#999", alignItems: "center", justifyContent: "center" },
  playText: { fontSize: 20 },
  deleteAll: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#d42a2a", alignItems: "center" },
  deleteAllText: { color: "#d42a2a", fontSize: 16, fontWeight: "700" },
});
