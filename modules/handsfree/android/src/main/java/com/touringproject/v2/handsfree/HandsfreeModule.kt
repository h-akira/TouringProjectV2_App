package com.touringproject.v2.handsfree

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HandsfreeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Handsfree")
    Events("onPress")

    // Only while JS actually listens: after Back the module outlives the React tree, and a press sent then would be
    // lost instead of waiting in PressStore for takePendingPress().
    OnStartObserving("onPress") {
      PressStore.listener = { pressedAt -> sendEvent("onPress", mapOf("pressedAt" to pressedAt.toDouble())) }
    }

    OnStopObserving("onPress") {
      PressStore.listener = null
    }

    OnDestroy {
      PressStore.listener = null
    }

    // A press that arrived before JS was listening (cold start from the intercom button).
    Function("takePendingPress") {
      PressStore.take()?.toDouble()
    }
  }
}
