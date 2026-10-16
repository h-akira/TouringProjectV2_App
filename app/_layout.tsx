import { Stack } from "expo-router";

import { AskProvider } from "../src/ask/AskProvider";
import { AskOverlay } from "../src/ui/AskOverlay";

export default function Layout() {
  return (
    <AskProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: "Touring V2" }} />
        <Stack.Screen name="settings/index" options={{ title: "設定" }} />
        <Stack.Screen name="settings/connection" options={{ title: "接続の設定" }} />
        <Stack.Screen name="settings/user" options={{ title: "ユーザー名" }} />
        <Stack.Screen name="settings/return-app" options={{ title: "応答後に戻るアプリ" }} />
      </Stack>
      <AskOverlay />
    </AskProvider>
  );
}
