export const TRACKER_PHASE4B_SYNC_COALESCE_MS = 5_000

interface Phase4bSyncEventTarget {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}
export interface TrackerPhase4bSyncTriggerDependencies {
  flush: () => void
  subscribeChanges: (listener: () => void) => () => void
  windowTarget: Phase4bSyncEventTarget
  documentTarget: Phase4bSyncEventTarget
  isOnline: () => boolean
  isVisible: () => boolean
  setTimer: (callback: () => void, delayMs: number) => number
  clearTimer: (timerId: number) => void
}

export function installTrackerPhase4bSyncTriggers(
  dependencies: TrackerPhase4bSyncTriggerDependencies,
): () => void {
  let timer: number | null = null
  let active = true

  const flush = () => {
    if (!active || !dependencies.isOnline()) return
    dependencies.flush()
  }
  const schedule = () => {
    if (timer !== null) dependencies.clearTimer(timer)
    timer = dependencies.setTimer(() => {
      timer = null
      flush()
    }, TRACKER_PHASE4B_SYNC_COALESCE_MS)
  }
  const onVisible = () => {
    if (dependencies.isVisible()) flush()
  }
  const unsubscribe = dependencies.subscribeChanges(schedule)

  dependencies.windowTarget.addEventListener('focus', flush)
  dependencies.windowTarget.addEventListener('online', flush)
  dependencies.documentTarget.addEventListener('visibilitychange', onVisible)
  schedule()

  return () => {
    active = false
    if (timer !== null) dependencies.clearTimer(timer)
    unsubscribe()
    dependencies.windowTarget.removeEventListener('focus', flush)
    dependencies.windowTarget.removeEventListener('online', flush)
    dependencies.documentTarget.removeEventListener('visibilitychange', onVisible)
  }
}
