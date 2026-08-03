import { useEffect } from 'react'

import { useAuth } from '@/auth/authContext'
import { STORAGE_PREFIX } from '@/lib/constants'
import { isLocalDate } from '@/lib/localDate'
import { TrackerShadowSyncRuntime } from '@/sync/trackerShadowSyncRuntime'
import { installTrackerShadowSyncTriggers } from '@/sync/trackerShadowSyncTriggers'
import { useTrackerSyncStatusStore } from '@/sync/trackerSyncStatusStore'
import { useSettingsStore } from '@/stores/settingsStore'

const SETTINGS_STORAGE_KEY = `${STORAGE_PREFIX}:settings`

function readPersistedExamDate(): string | undefined {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (raw === null) return undefined
    const value = JSON.parse(raw) as { state?: { examDate?: unknown } }
    return isLocalDate(value.state?.examDate) ? value.state.examDate : undefined
  } catch {
    return useSettingsStore.getState().examDate
  }
}

export function TrackerShadowSyncBridge() {
  const { status, user, managedAiDataBinding } = useAuth()
  const accountUserId = status === 'signed-in' && managedAiDataBinding.status === 'bound'
    ? user?.id ?? null
    : null

  useEffect(() => {
    const statusStore = useTrackerSyncStatusStore.getState()
    statusStore.reset(accountUserId)
    if (!accountUserId) return

    const updateFailureStatus = () => {
      useTrackerSyncStatusStore.getState().update({
        accountUserId,
        phase: navigator.onLine ? 'error' : 'offline',
        detail: navigator.onLine ? '暂时无法同步，稍后会自动重试' : '当前离线，考试日期已保存在本机',
        conflict: null,
        resolveConflict: null,
      })
    }
    const runtime = new TrackerShadowSyncRuntime({
      accountUserId,
      readLocalExamDate: () => readPersistedExamDate() ?? null,
      installRemoteExamDate: (remoteExamDate, expectedLocalExamDate) => {
        const settings = useSettingsStore.getState()
        const currentExamDate = readPersistedExamDate() ?? null
        if (currentExamDate !== expectedLocalExamDate) return currentExamDate
        if (remoteExamDate === null) settings.clearExamDate()
        else settings.setExamDate(remoteExamDate)
        return remoteExamDate
      },
      onStatusChange: (nextStatus) => {
        useTrackerSyncStatusStore.getState().update({
          accountUserId,
          phase: nextStatus.phase,
          detail: nextStatus.detail ?? '',
          ...(nextStatus.lastSyncedAt ? { lastSyncedAt: nextStatus.lastSyncedAt } : {}),
          conflict: nextStatus.conflict ?? null,
          resolveConflict: nextStatus.conflict
            ? async (choice) => {
                try {
                  await runtime.resolveBaselineConflict(choice)
                } catch {
                  updateFailureStatus()
                }
              }
            : null,
        })
      },
    })
    const removeTriggers = installTrackerShadowSyncTriggers({
      flush: (examDate) => {
        void runtime.flush(examDate).catch(() => {
          updateFailureStatus()
        })
      },
      // Read the persisted source so a stale background tab cannot upload an
      // older in-memory date after another tab has installed a cloud update.
      getExamDate: readPersistedExamDate,
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
    const onOffline = () => updateFailureStatus()
    const onStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) void useSettingsStore.persist.rehydrate()
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('storage', onStorage)
    if (!navigator.onLine) onOffline()

    return () => {
      removeTriggers()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('storage', onStorage)
    }
  }, [accountUserId])

  return null
}
