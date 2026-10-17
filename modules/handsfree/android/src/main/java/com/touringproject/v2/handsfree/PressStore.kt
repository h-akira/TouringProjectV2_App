package com.touringproject.v2.handsfree

// Shared between the activity lifecycle listener and the module, which may not exist yet at cold start.
// A press goes either to the listener or into pending, never both: a press kept after it was delivered would be
// handed out again by takePendingPress() when the React tree is recreated (issue #2).
object PressStore {
  private var pending: Long? = null
  @Volatile var listener: ((Long) -> Unit)? = null

  fun record(pressedAt: Long) {
    val current = synchronized(this) {
      val l = listener
      pending = if (l == null) pressedAt else null
      l
    }
    current?.invoke(pressedAt)
  }

  @Synchronized
  fun take(): Long? {
    val value = pending
    pending = null
    return value
  }
}
