import { describe, expect, it, vi } from 'vitest'

import {
  installTrackerPhase4bSyncTriggers,
  TRACKER_PHASE4B_SYNC_COALESCE_MS,
} from '@/sync/trackerPhase4bSyncTriggers'

class FakeEventTarget {
  listeners = new Map<string, Set<() => void>>()
  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }
  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener)
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener())
  }
}

describe('Tracker Phase 4B browser triggers', () => {
  it('coalesces record changes while keeping focus and online retries immediate', () => {
    const windowTarget = new FakeEventTarget()
    const documentTarget = new FakeEventTarget()
    const flush = vi.fn()
    let online = true
    let visible = true
    let subscribed: (() => void) | null = null
    let nextTimer = 0
    const timers = new Map<number, { callback: () => void; delay: number }>()
    const cleanup = installTrackerPhase4bSyncTriggers({
      flush,
      subscribeChanges: (listener) => {
        subscribed = listener
        return () => { subscribed = null }
      },
      windowTarget,
      documentTarget,
      isOnline: () => online,
      isVisible: () => visible,
      setTimer: (callback, delay) => {
        nextTimer += 1
        timers.set(nextTimer, { callback, delay })
        return nextTimer
      },
      clearTimer: (timerId) => { timers.delete(timerId) },
    })

    expect([...timers.values()][0]?.delay).toBe(TRACKER_PHASE4B_SYNC_COALESCE_MS)
    if (!subscribed) throw new Error('missing record subscription')
    ;(subscribed as () => void)()
    ;(subscribed as () => void)()
    expect(timers.size).toBe(1)
    ;[...timers.values()][0].callback()
    expect(flush).toHaveBeenCalledTimes(1)

    windowTarget.emit('focus')
    expect(flush).toHaveBeenCalledTimes(2)
    online = false
    windowTarget.emit('focus')
    expect(flush).toHaveBeenCalledTimes(2)
    online = true
    windowTarget.emit('online')
    expect(flush).toHaveBeenCalledTimes(3)
    visible = false
    documentTarget.emit('visibilitychange')
    expect(flush).toHaveBeenCalledTimes(3)

    cleanup()
    windowTarget.emit('focus')
    expect(flush).toHaveBeenCalledTimes(3)
  })
})
