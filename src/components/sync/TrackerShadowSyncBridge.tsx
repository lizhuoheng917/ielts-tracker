import { useEffect } from 'react'

import { useAuth } from '@/auth/authContext'
import { STORAGE_PREFIX } from '@/lib/constants'
import { isLocalDate } from '@/lib/localDate'
import {
  TrackerPhase4bSyncRuntime,
  type TrackerPhase4bSyncStatusEvent,
} from '@/sync/trackerPhase4bSyncRuntime'
import { installTrackerPhase4bSyncTriggers } from '@/sync/trackerPhase4bSyncTriggers'
import { TrackerShadowSyncRuntime } from '@/sync/trackerShadowSyncRuntime'
import { installTrackerShadowSyncTriggers } from '@/sync/trackerShadowSyncTriggers'
import {
  aggregateTrackerSyncStatus,
  type TrackerSyncStreamStatus,
} from '@/sync/trackerSyncStatusAggregation'
import { useTrackerSyncStatusStore } from '@/sync/trackerSyncStatusStore'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTimerStore } from '@/stores/timerStore'

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

function reportSyncFailure(stream: 'exam-date' | 'learning-records', error: unknown): void {
  const detail = error instanceof Error
    ? `${error.name}: ${error.message}`
    : 'Unknown sync failure'
  console.warn(`[tracker-sync:${stream}] ${detail}`)
}

function syncDebugDetail(error: unknown): string | null {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('syncDebug')) {
    return null
  }
  return error instanceof Error
    ? `诊断：${error.name}: ${error.message}`
    : '诊断：Unknown sync failure'
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

    let active = true
    const emptyStream = (): TrackerSyncStreamStatus => ({
      phase: 'idle',
      detail: '',
      lastSyncedAt: null,
      conflict: null,
      resolveConflict: null,
    })
    let examDateStatus = emptyStream()
    let learningRecordsStatus = emptyStream()

    const publish = () => {
      if (!active) return
      useTrackerSyncStatusStore.getState().update(aggregateTrackerSyncStatus({
        accountUserId,
        examDate: examDateStatus,
        learningRecords: learningRecordsStatus,
      }))
    }
    const mergeStream = (
      current: TrackerSyncStreamStatus,
      next: Pick<TrackerSyncStreamStatus, 'phase'> & Partial<TrackerSyncStreamStatus>,
    ): TrackerSyncStreamStatus => ({
      ...current,
      ...next,
      lastSyncedAt: next.lastSyncedAt ?? current.lastSyncedAt,
    })
    const updateFailureStatus = (stream: 'exam' | 'learning', error?: unknown) => {
      const diagnostic = syncDebugDetail(error)
      const failure: TrackerSyncStreamStatus = {
        phase: navigator.onLine ? 'error' : 'offline',
        detail: navigator.onLine
          ? diagnostic ?? '暂时无法同步，稍后会自动重试；本机记录不受影响'
          : '当前离线，学习数据已保存在本机',
        lastSyncedAt: stream === 'exam'
          ? examDateStatus.lastSyncedAt
          : learningRecordsStatus.lastSyncedAt,
        conflict: null,
        resolveConflict: null,
      }
      if (stream === 'exam') examDateStatus = failure
      else learningRecordsStatus = failure
      publish()
    }
    const examDateRuntime = new TrackerShadowSyncRuntime({
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
        if (!active) return
        examDateStatus = mergeStream(examDateStatus, {
          phase: nextStatus.phase,
          detail: nextStatus.detail ?? '',
          ...(nextStatus.lastSyncedAt ? { lastSyncedAt: nextStatus.lastSyncedAt } : {}),
          conflict: nextStatus.conflict ?? null,
          resolveConflict: nextStatus.conflict
            ? async (choice) => {
                try {
                  await examDateRuntime.resolveBaselineConflict(choice)
                } catch {
                  updateFailureStatus('exam')
                }
              }
            : null,
        })
        publish()
      },
    })
    const learningRuntime = new TrackerPhase4bSyncRuntime({
      accountUserId,
      onStatusChange: (event: TrackerPhase4bSyncStatusEvent) => {
        if (!active) return
        // Record restore decisions are intentionally not exposed through the
        // exam-date conflict buttons. Until the dedicated record-level UI is
        // added, the affected record remains local and every other record can
        // continue syncing.
        learningRecordsStatus = mergeStream(learningRecordsStatus, {
          phase: event.phase === 'needs_choice' ? 'partial' : event.phase,
          detail: event.detail ?? '',
          ...(event.lastSyncedAt ? { lastSyncedAt: event.lastSyncedAt } : {}),
          conflict: null,
          resolveConflict: null,
        })
        publish()
      },
    })
    const removeExamDateTriggers = installTrackerShadowSyncTriggers({
      flush: (examDate) => {
        void examDateRuntime.flush(examDate).catch((error) => {
          reportSyncFailure('exam-date', error)
          updateFailureStatus('exam', error)
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
    const removeLearningTriggers = installTrackerPhase4bSyncTriggers({
      flush: () => {
        void learningRuntime.flush().catch((error) => {
          reportSyncFailure('learning-records', error)
          updateFailureStatus('learning', error)
        })
      },
      subscribeChanges: (listener) => {
        const unsubscribePlan = usePlanStore.subscribe((state, previous) => {
          if (state.mutationRevision !== previous.mutationRevision) listener()
        })
        const unsubscribePractice = usePracticeStore.subscribe((state, previous) => {
          if (state.mutationRevision !== previous.mutationRevision) listener()
        })
        const unsubscribeTimer = useTimerStore.subscribe((state, previous) => {
          if (state.mutationRevision !== previous.mutationRevision) listener()
        })
        return () => {
          unsubscribePlan()
          unsubscribePractice()
          unsubscribeTimer()
        }
      },
      windowTarget: window,
      documentTarget: document,
      isOnline: () => navigator.onLine,
      isVisible: () => document.visibilityState === 'visible',
      setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimer: (timerId) => window.clearTimeout(timerId),
    })
    const onOffline = () => {
      updateFailureStatus('exam')
      updateFailureStatus('learning')
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) void useSettingsStore.persist.rehydrate()
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('storage', onStorage)
    if (!navigator.onLine) onOffline()

    return () => {
      active = false
      removeExamDateTriggers()
      removeLearningTriggers()
      examDateRuntime.dispose()
      learningRuntime.dispose()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('storage', onStorage)
    }
  }, [accountUserId])

  return null
}
