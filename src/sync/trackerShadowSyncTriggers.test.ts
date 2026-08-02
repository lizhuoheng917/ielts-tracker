import { describe, expect, it, vi } from 'vitest'

import {
  installTrackerShadowSyncTriggers,
  TRACKER_SHADOW_SYNC_COALESCE_MS,
} from '@/sync/trackerShadowSyncTriggers'

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

describe('Tracker shadow sync browser triggers', () => {
  it('coalesces edits for five seconds and retries on focus/online', () => {
    const windowTarget = new FakeEventTarget()
    const documentTarget = new FakeEventTarget()
    const flush = vi.fn()
    let examDate: string | undefined = '2026-12-01'
    let online = true
    let subscribed: (() => void) | null = null
    let nextTimer = 0
    const timers = new Map<number, { callback: () => void; delay: number }>()
    const cleanup = installTrackerShadowSyncTriggers({
      flush,
      getExamDate: () => examDate,
      subscribeExamDate: (listener) => {
        subscribed = listener
        return () => { subscribed = null }
      },
      windowTarget,
      documentTarget,
      isOnline: () => online,
      isVisible: () => true,
      setTimer: (callback, delay) => {
        nextTimer += 1
        timers.set(nextTimer, { callback, delay })
        return nextTimer
      },
      clearTimer: (timerId) => { timers.delete(timerId) },
    })

    expect([...timers.values()][0]?.delay).toBe(TRACKER_SHADOW_SYNC_COALESCE_MS)
    examDate = '2027-01-15'
    if (!subscribed) throw new Error('missing examDate subscription')
    ;(subscribed as () => void)()
    expect(timers.size).toBe(1)
    ;[...timers.values()][0].callback()
    expect(flush).toHaveBeenLastCalledWith('2027-01-15')

    windowTarget.emit('focus')
    expect(flush).toHaveBeenCalledTimes(2)
    online = false
    windowTarget.emit('focus')
    expect(flush).toHaveBeenCalledTimes(2)
    online = true
    windowTarget.emit('online')
    expect(flush).toHaveBeenCalledTimes(3)

    cleanup()
    windowTarget.emit('focus')
    expect(flush).toHaveBeenCalledTimes(3)
  })
})
