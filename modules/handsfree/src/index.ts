import { NativeModule, requireNativeModule } from "expo-modules-core";

type Events = { onPress: (event: { pressedAt: number }) => void };

declare class HandsfreeModule extends NativeModule<Events> {
  takePendingPress(): number | null;
}

export default requireNativeModule<HandsfreeModule>("Handsfree");
