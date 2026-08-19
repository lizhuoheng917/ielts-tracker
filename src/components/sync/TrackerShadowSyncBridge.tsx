import { useEffect } from 'react'

import { useAuth } from '@/auth/authContext'
import { STORAGE_PREFIX } from '@/lib/constants'
import { isLocalDate } from '@/lib/localDate'
import { reportTrackerRuntimeSignal } from '@/lib/runtimeTelemetry'
import {
  TrackerPhase4bSyncRuntime,
  type TrackerPhase4bSyncStatusEvent,
} from '@/sync/trackerPhase4bSyncRuntime'
import { readTrackerPhase4bStoreSnapshot } from '@/sync/trackerPhase4bStoreAdapter'
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
import { useWordStore } from '@/stores/wordStore'
import {
  applyTrackerContentCloudCapabilities,
  identitiesFromTrackerContentSnapshot,
  TRACKER_CONTENT_CLOUD_DEVICE_SCOPE,
  TRACKER_CONTENT_CLOUD_POLICY_REFRESH_EVENT,
  TRACKER_CONTENT_CLOUD_POLICY_STORAGE_KEY,
  TRACKER_CONTENT_CLOUD_SYNC_EVENT,
  type TrackerContentCloudPolicyRefreshRequest,
  trackerContentCloudPolicyRevision,
  useTrackerContentCloudPolicyStore,
} from '@/sync/trackerContentCloudPolicy'
import { TrackerContentCloudPolicyRefreshRuntime } from '@/sync/trackerContentCloudPolicyRefresh'

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
  void reportTrackerRuntimeSignal({
    kind: 'sync_failure',
    error,
  })
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
    const contentPolicy = useTrackerContentCloudPolicyStore.getState()
    contentPolicy.activateScope(accountUserId ?? TRACKER_CONTENT_CLOUD_DEVICE_SCOPE, {
      // The current device data can only be claimed after the existing managed
      // account-binding guard has confirmed this exact account.
      adoptDeviceScope: Boolean(accountUserId),
    })
    try {
      contentPolicy.ensureLegacyContent(
        identitiesFromTrackerContentSnapshot(readTrackerPhase4bStoreSnapshot()),
      )
    } catch {
      // Phase 4B's normal quarantine path will keep malformed legacy rows
      // local. Do not create a cloud policy from an untrusted partial shape.
    }
    const statusStore = useTrackerSyncStatusStore.getState()
    statusStore.reset(accountUserId)
    if (!accountUserId) return

    let active = true
    const contentPolicyRefresh = new TrackerContentCloudPolicyRefreshRuntime({ accountUserId })
    const refreshContentPolicy = (request: TrackerContentCloudPolicyRefreshRequest = {}) => {
      void contentPolicyRefresh.refresh(request)
    }
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
                } catch (error) {
                  reportSyncFailure('exam-date', error)
                  updateFailureStatus('exam', error)
                }
              }
            : null,
        })
        publish()
      },
    })
    const learningRuntime = new TrackerPhase4bSyncRuntime({
      accountUserId,
      onCapabilities: (capabilities) => {
        applyTrackerContentCloudCapabilities({
          accountUserId,
          selectiveCloudAvailable: capabilities.selectiveContentCloudEnabled,
          quota: capabilities.contentQuota,
          status: { contentCursor: capabilities.currentCursor },
        })
      },
      onOperationRejected: ({ entityKind, entityId, reason }) => {
        useTrackerContentCloudPolicyStore.getState().markRejected(entityKind, entityId, reason)
      },
      onOperationApplied: ({ entityKind, entityId, action, restoreDeleted }) => {
        const policy = useTrackerContentCloudPolicyStore.getState()
        policy.clearFailure(entityKind, entityId)
        if (entityKind !== 'plan_execution') {
          policy.completeContentTransfer(entityKind, entityId, action === 'upsert' ? 'cloud' : 'local')
        }
        if (restoreDeleted) policy.acknowledgeRestore(entityKind, entityId)
        // A completed upload/delete can change the server count. Refresh the
        // visible allowance without forcing another record reconciliation.
        refreshContentPolicy({ force: true, reason: 'after-save' })
      },
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
        const unsubscribeWords = useWordStore.subscribe((state, previous) => {
          if (state.mutationRevision !== previous.mutationRevision) listener()
        })
        const unsubscribeContentPolicy = useTrackerContentCloudPolicyStore.subscribe((state, previous) => {
          if (
            state.activeScope === previous.activeScope
            && trackerContentCloudPolicyRevision(state) !== trackerContentCloudPolicyRevision(previous)
          ) listener()
        })
        return () => {
          unsubscribePlan()
          unsubscribePractice()
          unsubscribeTimer()
          unsubscribeWords()
          unsubscribeContentPolicy()
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
    const onContentCloudPolicyRefresh = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return
      const request = detail as { force?: unknown; reason?: unknown }
      if (
        (request.force !== undefined && typeof request.force !== 'boolean')
        || (request.reason !== undefined && typeof request.reason !== 'string')
      ) return
      refreshContentPolicy({
        ...(request.force === true ? { force: true } : {}),
        ...(typeof request.reason === 'string'
          ? { reason: request.reason as TrackerContentCloudPolicyRefreshRequest['reason'] }
          : {}),
      })
    }
    const onContentCloudPolicyFocus = () => refreshContentPolicy({ reason: 'focus' })
    const onContentCloudPolicyVisibility = () => {
      if (document.visibilityState === 'visible') refreshContentPolicy({ reason: 'visibility' })
    }
    const onContentCloudPolicyOnline = () => refreshContentPolicy({ force: true, reason: 'online' })
    // While a learner stays on a save-location form, an administrator change
    // should arrive without requiring a tab switch. The refresh runtime uses
    // the lightweight status RPC when available and still enforces its own TTL.
    const contentCloudPolicyInterval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        refreshContentPolicy({ reason: 'interval' })
      }
    }, 60_000)
    const onStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_STORAGE_KEY) void useSettingsStore.persist.rehydrate()
      if (event.key === TRACKER_CONTENT_CLOUD_POLICY_STORAGE_KEY) {
        void useTrackerContentCloudPolicyStore.persist.rehydrate()
      }
    }
    const onContentCloudSyncRequest = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      if (
        typeof detail !== 'object'
        || detail === null
        || Array.isArray(detail)
        || typeof (detail as { entityKind?: unknown }).entityKind !== 'string'
        || typeof (detail as { entityId?: unknown }).entityId !== 'string'
      ) return
      const request = detail as {
        entityKind: Parameters<typeof learningRuntime.retryEntity>[0]
        entityId: string
        retry?: boolean
        planTransfer?: 'uploading' | 'removing'
      }
      if (
        request.entityKind === 'study_plan'
        && (request.planTransfer === 'uploading' || request.planTransfer === 'removing')
      ) {
        void learningRuntime.transferPlan(request.entityId, request.planTransfer)
          .catch((error) => {
            reportSyncFailure('learning-records', error)
            updateFailureStatus('learning', error)
          })
          .finally(() => refreshContentPolicy({ force: true, reason: 'after-save' }))
        return
      }
      if (request.retry) {
        void learningRuntime.retryEntity(request.entityKind, request.entityId)
          .catch((error) => {
            reportSyncFailure('learning-records', error)
            updateFailureStatus('learning', error)
          })
          .finally(() => refreshContentPolicy({ force: true, reason: 'after-save' }))
        return
      }
      void learningRuntime.flush()
        .catch((error) => {
          reportSyncFailure('learning-records', error)
          updateFailureStatus('learning', error)
        })
        .finally(() => refreshContentPolicy({ force: true, reason: 'after-save' }))
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('storage', onStorage)
    window.addEventListener(TRACKER_CONTENT_CLOUD_SYNC_EVENT, onContentCloudSyncRequest)
    window.addEventListener(TRACKER_CONTENT_CLOUD_POLICY_REFRESH_EVENT, onContentCloudPolicyRefresh)
    window.addEventListener('focus', onContentCloudPolicyFocus)
    window.addEventListener('online', onContentCloudPolicyOnline)
    document.addEventListener('visibilitychange', onContentCloudPolicyVisibility)
    refreshContentPolicy({ force: true, reason: 'initial' })
    if (!navigator.onLine) onOffline()

    return () => {
      active = false
      removeExamDateTriggers()
      removeLearningTriggers()
      examDateRuntime.dispose()
      learningRuntime.dispose()
      contentPolicyRefresh.dispose()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(TRACKER_CONTENT_CLOUD_SYNC_EVENT, onContentCloudSyncRequest)
      window.removeEventListener(TRACKER_CONTENT_CLOUD_POLICY_REFRESH_EVENT, onContentCloudPolicyRefresh)
      window.removeEventListener('focus', onContentCloudPolicyFocus)
      window.removeEventListener('online', onContentCloudPolicyOnline)
      document.removeEventListener('visibilitychange', onContentCloudPolicyVisibility)
      window.clearInterval(contentCloudPolicyInterval)
    }
  }, [accountUserId])

  return null
}
