// Device storage adapters: AsyncStorage for settings, SecureStore for the connection key.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { KeyValueStore } from "./store";

const API_KEY = "trv2.apiKey";

export const settingsStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

export function loadApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(API_KEY);
}

export function saveApiKey(key: string): Promise<void> {
  return SecureStore.setItemAsync(API_KEY, key);
}

export function deleteApiKey(): Promise<void> {
  return SecureStore.deleteItemAsync(API_KEY);
}
