export const TRACKER_SHADOW_SYNC_COALESCE_MS = 5_000

interface ShadowSyncEventTarget {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

export interface TrackerShadowSyncTriggerDependencies {
  flush: (examDate: string | undefined) => void
  getExamDate: () => string | undefined
  subscribeExamDate: (listener: () => void) => () => void
  windowTarget: ShadowSyncEventTarget
  documentTarget: ShadowSyncEventTarget
  isOnline: () => boolean
  isVisible: () => boolean
  setTimer: (callback: () => void, delayMs: number) => number
  clearTimer: (timerId: number) => void
}

export function installTrackerShadowSyncTriggers(
  dependencies: TrackerShadowSyncTriggerDependencies,
): () => void {
  let timer: number | null = null
  let active = true

  const flush = () => {
    if (!active || !dependencies.isOnline()) return
    dependencies.flush(dependencies.getExamDate())
  }
  const schedule = () => {
    if (timer !== null) dependencies.clearTimer(timer)
    timer = dependencies.setTimer(() => {
      timer = null
      flush()
    }, TRACKER_SHADOW_SYNC_COALESCE_MS)
  }
  const onVisible = () => {
    if (dependencies.isVisible()) flush()
  }
  const unsubscribe = dependencies.subscribeExamDate(schedule)

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
