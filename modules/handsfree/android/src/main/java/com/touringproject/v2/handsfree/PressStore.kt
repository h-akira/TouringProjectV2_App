package com.touringproject.v2.handsfree

// Shared between the activity lifecycle listener and the module, which may not exist yet at cold start.
object PressStore {
  @Volatile private var pending: Long? = null
  @Volatile var listener: ((Long) -> Unit)? = null

  fun record(pressedAt: Long) {
    pending = pressedAt
    listener?.invoke(pressedAt)
  }

  fun take(): Long? {
    val value = pending
    pending = null
    return value
  }
}
