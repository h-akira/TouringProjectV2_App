package com.touringproject.v2.handsfree

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HandsfreeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Handsfree")
    Events("onPress")

    OnCreate {
      PressStore.listener = { pressedAt -> sendEvent("onPress", mapOf("pressedAt" to pressedAt.toDouble())) }
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
