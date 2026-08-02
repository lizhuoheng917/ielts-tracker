import { useEffect } from 'react'

import { useAuth } from '@/auth/authContext'
import { TrackerShadowSyncRuntime } from '@/sync/trackerShadowSyncRuntime'
import { installTrackerShadowSyncTriggers } from '@/sync/trackerShadowSyncTriggers'
import { useSettingsStore } from '@/stores/settingsStore'

export function TrackerShadowSyncBridge() {
  const { status, user, managedAiDataBinding } = useAuth()
  const accountUserId = status === 'signed-in' && managedAiDataBinding.status === 'bound'
    ? user?.id ?? null
    : null

  useEffect(() => {
    if (!accountUserId) return
    const runtime = new TrackerShadowSyncRuntime({ accountUserId })
    return installTrackerShadowSyncTriggers({
      flush: (examDate) => {
        void runtime.flush(examDate).catch(() => {
          // Shadow sync must never interrupt visible local-first learning flows.
          // Focus/online and the next local edit provide bounded retries.
        })
      },
      getExamDate: () => useSettingsStore.getState().examDate,
      subscribeExamDate: (listener) => useSettingsStore.subscribe((state, previous) => {
        if (state.examDate !== previous.examDate) listener()
      }),
      windowTarget: window,
      documentTarget: document,
      isOnline: () => navigator.onLine,
      isVisible: () => document.visibilityState === 'visible',
      setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimer: (timerId) => window.clearTimeout(timerId),
    })
  }, [accountUserId])

  return null
}
