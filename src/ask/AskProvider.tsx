import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import AudioRoute from "../../modules/audio-route/src";
import Handsfree from "../../modules/handsfree/src";
import { PressGate } from "../handsfree/press";
import { loadApiKey, deleteApiKey, saveApiKey, settingsStore } from "../settings/storage";
import { loadSettings, saveSettings, Settings } from "../settings/store";
import { AskController } from "./controller";
import { FlowState, IDLE } from "./flow";
import { createRuntimeDeps, requestPermissions } from "./runtime";

type AskContext = {
  ready: boolean;
  state: FlowState;
  controller: AskController | null;
  settings: Settings | null;
  updateSettings(next: Settings): Promise<void>;
  apiKey: string | null;
  setApiKey(key: string | null): Promise<void>;
  conversationExpiresAt: number | null;
};

const Context = createContext<AskContext | null>(null);

export function useAsk(): AskContext {
  const value = useContext(Context);
  if (!value) throw new Error("useAsk outside AskProvider");
  return value;
}

export function AskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FlowState>(IDLE);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef<Settings | null>(null);
  const keyRef = useRef<string | null>(null);
  const controllerRef = useRef<AskController | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createRuntimeDeps> | null>(null);
  const presses = useRef(new PressGate(() => controllerRef.current?.press()));

  const handlePress = useCallback((pressedAt: number) => presses.current.offer(pressedAt, Date.now()), []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await requestPermissions();
      const loaded = await loadSettings(settingsStore);
      const key = await loadApiKey();
      if (!mounted) return;
      settingsRef.current = loaded;
      keyRef.current = key;
      setSettings(loaded);
      setApiKeyState(key);
      const runtime = createRuntimeDeps({
        settings: () => settingsRef.current!,
        apiKey: () => keyRef.current,
        onState: setState,
      });
      runtimeRef.current = runtime;
      controllerRef.current = new AskController(runtime.deps);
      setReady(true);
      const pending = Handsfree.takePendingPress();
      if (pending !== null) handlePress(pending);
      presses.current.openGate(Date.now());
    })();
    const pressSub = Handsfree.addListener("onPress", (e) => handlePress(e.pressedAt));
    // The headset dropping SCO during a voice-recognition session is the second press.
    const endSub = AudioRoute.addListener("onVoiceRecognitionEnded", () => controllerRef.current?.stopRecording());
    return () => {
      mounted = false;
      pressSub.remove();
      endSub.remove();
      runtimeRef.current?.dispose();
    };
  }, [handlePress]);

  const updateSettings = useCallback(async (next: Settings) => {
    settingsRef.current = next;
    setSettings(next);
    await saveSettings(settingsStore, next);
  }, []);

  const setApiKey = useCallback(async (key: string | null) => {
    keyRef.current = key;
    setApiKeyState(key);
    if (key) await saveApiKey(key);
    else await deleteApiKey();
  }, []);

  const conversationExpiresAt = runtimeRef.current?.deps.conversation.expiresAt(Date.now()) ?? null;
  const value = useMemo(
    () => ({ ready, state, controller: controllerRef.current, settings, updateSettings, apiKey, setApiKey, conversationExpiresAt }),
    [ready, state, settings, updateSettings, apiKey, setApiKey, conversationExpiresAt],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
