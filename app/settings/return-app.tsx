import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import RideService, { LaunchableApp } from "../../modules/ride-service/src";
import { useAsk } from "../../src/ask/AskProvider";
import { ReturnTiming, withRecentApp } from "../../src/settings/store";

const TIMINGS: { value: ReturnTiming; label: string }[] = [
  { value: "sent", label: "送ったらすぐ" },
  { value: "answered", label: "回答が届いたら" },
  { value: "spoken", label: "読み上げが終わったら" },
];

export default function ReturnApp() {
  const { settings, updateSettings } = useAsk();
  const [apps, setApps] = useState<LaunchableApp[]>([]);
  const [filter, setFilter] = useState("");
  useEffect(() => { void RideService.listLaunchableApps().then(setApps); }, []);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? apps.filter((a) => a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q)) : apps;
  }, [apps, filter]);
  if (!settings) return null;

  const choose = (app: LaunchableApp) => void updateSettings({ ...settings, returnApp: app, recentApps: withRecentApp(settings.recentApps, app) });
  const forget = (app: LaunchableApp) => void updateSettings({ ...settings, recentApps: settings.recentApps.filter((a) => a.packageName !== app.packageName) });

  return (
    <View style={styles.root}>
      <View style={styles.switchRow}>
        <Text style={styles.title}>応答後にアプリへ戻る</Text>
        <Switch value={settings.returnEnabled} onValueChange={(v) => void updateSettings({ ...settings, returnEnabled: v })} />
      </View>
      <Text style={styles.note}>戻るのはインカムのボタンで始めた応答だけです（画面から質問したときは戻りません）。</Text>
      {settings.returnEnabled ? (
        <>
          <View style={styles.timings}>
            {TIMINGS.map((t) => (
              <Pressable key={t.value} style={[styles.timing, settings.returnTiming === t.value && styles.timingOn]} onPress={() => void updateSettings({ ...settings, returnTiming: t.value })}>
                <Text style={settings.returnTiming === t.value ? styles.timingTextOn : styles.timingText}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.current}>現在の戻り先: {settings.returnApp?.label ?? "未設定"}</Text>
          {settings.recentApps.map((app) => (
            <View key={app.packageName} style={styles.recent}>
              <Pressable style={styles.recentMain} onPress={() => choose(app)}><Text style={styles.appLabel}>{app.label}</Text></Pressable>
              <Pressable onPress={() => forget(app)}><Text style={styles.forget}>✕</Text></Pressable>
            </View>
          ))}
          <TextInput style={styles.input} value={filter} onChangeText={setFilter} placeholder="アプリを絞り込む" autoCapitalize="none" />
          <FlatList
            data={filtered}
            keyExtractor={(a) => a.packageName}
            renderItem={({ item }) => (
              <Pressable style={styles.app} onPress={() => choose(item)}>
                <Text style={styles.appLabel}>{item.label}</Text>
                <Text style={styles.appPackage}>{item.packageName}</Text>
              </Pressable>
            )}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18 },
  note: { fontSize: 13, color: "#666" },
  timings: { flexDirection: "row", gap: 6 },
  timing: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#1f4fd1", alignItems: "center" },
  timingOn: { backgroundColor: "#1f4fd1" },
  timingText: { color: "#1f4fd1", fontSize: 13 },
  timingTextOn: { color: "#fff", fontSize: 13 },
  current: { fontSize: 18, fontWeight: "700" },
  recent: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ddd", borderRadius: 8 },
  recentMain: { flex: 1, padding: 12 },
  forget: { fontSize: 18, padding: 12 },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 10, fontSize: 16 },
  app: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  appLabel: { fontSize: 16 },
  appPackage: { fontSize: 12, color: "#888" },
});
