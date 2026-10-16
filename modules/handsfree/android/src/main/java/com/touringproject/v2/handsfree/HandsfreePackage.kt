package com.touringproject.v2.handsfree

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

// Picked up by Expo autolinking (file name ends with Package.kt and imports Package).
class HandsfreePackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context): List<ReactActivityLifecycleListener> =
    listOf(VoiceCommandListener())
}

class VoiceCommandListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
    handle(activity.intent)
  }

  override fun onNewIntent(intent: Intent): Boolean {
    handle(intent)
    return false
  }

  private fun handle(intent: Intent?) {
    if (intent?.action != Intent.ACTION_VOICE_COMMAND) return
    // Rewrite the action so a recreated activity does not count the same press again.
    intent.action = Intent.ACTION_MAIN
    PressStore.record(System.currentTimeMillis())
  }
}
