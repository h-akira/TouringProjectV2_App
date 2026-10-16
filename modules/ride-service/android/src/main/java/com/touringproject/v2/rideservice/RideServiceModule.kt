package com.touringproject.v2.rideservice

import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.Collator
import java.util.Locale

class RideServiceModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext) { "reactContext is null" }
  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("RideService")

    Function("startService") {
      context.startForegroundService(Intent(context, RideForegroundService::class.java))
    }

    Function("stopService") {
      context.stopService(Intent(context, RideForegroundService::class.java))
    }

    // JS timers stop while the app is in the background; this one does not (adr/0004).
    AsyncFunction("sleep") { ms: Int, promise: Promise ->
      main.postDelayed({ promise.resolve(null) }, ms.toLong())
    }

    // Opens the nav app with its launcher intent, which resumes the existing task (the route survives).
    AsyncFunction("launchApp") { packageName: String ->
      val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return@AsyncFunction false
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        Log.w(TAG, "failed to launch $packageName", e)
        false
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("listLaunchableApps") {
      val pm = context.packageManager
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      pm.queryIntentActivities(intent, 0)
        .map { mapOf("packageName" to it.activityInfo.packageName, "label" to it.loadLabel(pm).toString()) }
        .distinctBy { it["packageName"] }
        .filter { it["packageName"] != context.packageName }
        .sortedWith(compareBy(Collator.getInstance(Locale.JAPANESE)) { it["label"] ?: "" })
    }

    // Short cues. "call" plays on the voice-call stream (heard on the intercom while SCO is up);
    // "music" plays on the media stream (heard over the intercom's A2DP after returning to the nav app).
    Function("playTone") { name: String, durationMs: Int, stream: String ->
      // Continuous tones only: the TONE_PROP_* tones have a built-in length (~0.16 s) that durationMs cannot extend.
      val tone = when (name) {
        "dial" -> ToneGenerator.TONE_SUP_DIAL
        "ack" -> ToneGenerator.TONE_DTMF_D
        "beep" -> ToneGenerator.TONE_DTMF_1
        else -> ToneGenerator.TONE_SUP_BUSY
      }
      val streamType = if (stream == "call") AudioManager.STREAM_VOICE_CALL else AudioManager.STREAM_MUSIC
      val generator = try {
        ToneGenerator(streamType, VOLUME)
      } catch (e: RuntimeException) {
        Log.w(TAG, "ToneGenerator failed", e)
        return@Function false
      }
      val started = generator.startTone(tone, durationMs)
      main.postDelayed({ generator.release() }, durationMs + 200L)
      started
    }
  }

  private companion object {
    const val TAG = "trv2.ride"
    const val VOLUME = 90
  }
}
