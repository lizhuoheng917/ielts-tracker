import { announceCanonicalMutation, withCanonicalMutationLock } from '@/data/canonicalMutationCoordinator'
import { rebuildActivityLedger } from '@/data/activityLedgerBootstrap'
import { createActivityTransactionPlan, type LedgerEventDraft } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { reconcileAchievementBadges } from '@/data/achievementReconciliation'
import {
  createEntityCollectionPatch,
  createStateFieldsPatch,
  readPendingLocalMutation,
  recoverPendingLocalMutation,
  type EntityMutationChange,
  type LocalMutationPatch,
} from '@/data/localMutationJournal'
import { STORAGE_PREFIX } from '@/lib/constants'
import { canonicalizePlanExecutions } from '@/lib/planExecution'
import type {
  PlanExecution,
  PracticeRecord,
  StudyPlan,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import { useAchievementStore } from '@/stores/achievementStore'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'
import {
  parseTrackerPhase4bLocalSnapshot,
  stableTrackerPhase4bJson,
  type TrackerPhase4bLocalSnapshot,
} from '@/sync/trackerPhase4bRecordSync'

const PLAN_STORAGE_KEY = `${STORAGE_PREFIX}:studyPlans`
const PRACTICE_STORAGE_KEY = `${STORAGE_PREFIX}:practiceRecords`
const TIMER_STORAGE_KEY = `${STORAGE_PREFIX}:timerRecords`
const WORD_STORAGE_KEY = `${STORAGE_PREFIX}:wordRecords`

export type TrackerPhase4bStoreInstallResult =
  | { status: 'installed'; snapshot: TrackerPhase4bLocalSnapshot }
  | { status: 'unchanged'; snapshot: TrackerPhase4bLocalSnapshot }
  | { status: 'stale'; snapshot: TrackerPhase4bLocalSnapshot }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableTrackerPhase4bJson(left) === stableTrackerPhase4bJson(right)
}

function collectionChanges<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): EntityMutationChange[] {
  const beforeById = new Map(before.map((value, index) => [value.id, { value, index }]))
  const afterById = new Map(after.map((value) => [value.id, value]))
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort()
  const changes: EntityMutationChange[] = []

  for (const id of ids) {
    const previous = beforeById.get(id)
    const next = afterById.get(id)
    if (sameValue(previous?.value ?? null, next ?? null)) continue
    changes.push({
      id,
      before: previous ? clone(previous.value) : null,
      beforeIndex: previous?.index ?? 0,
      expectedAfter: next ? clone(next) : null,
    })
  }
  return changes
}

function activityEvents<T extends PracticeRecord | TimerRecord | PlanExecution | WordRecord>(
  entityKind: 'practice_record' | 'timer_record' | 'plan_execution' | 'word_record',
  changes: readonly EntityMutationChange[],
  occurredAt: string,
): LedgerEventDraft[] {
  return changes.map((change) => {
    const before = change.before as T | null
    const after = change.expectedAfter as T | null
    return {
      entityKind,
      entityId: change.id,
      operation: before === null ? 'created' : after === null ? 'deleted' : 'updated',
      effectiveDate: after?.date ?? before?.date,
      occurredAt,
      source: 'rebase',
      before,
      after,
      idempotencyKey: `tracker-sync:${entityKind}:${change.id}:${occurredAt}:${stableTrackerPhase4bJson(after)}`,
    }
  })
}

async function rehydrateCanonicalStores(): Promise<void> {
  await Promise.all([
    Promise.resolve(usePlanStore.persist.rehydrate()),
    Promise.resolve(usePracticeStore.persist.rehydrate()),
    Promise.resolve(useTimerStore.persist.rehydrate()),
    Promise.resolve(useWordStore.persist.rehydrate()),
    Promise.resolve(useAchievementStore.persist.rehydrate()),
    Promise.resolve(useStreakStore.persist.rehydrate()),
    Promise.resolve(useSettingsStore.persist.rehydrate()),
    Promise.resolve(useActivityLedgerStore.persist.rehydrate()),
  ])
}

export function readTrackerPhase4bStoreSnapshot(): TrackerPhase4bLocalSnapshot {
  const plans = usePlanStore.getState()
  return parseTrackerPhase4bLocalSnapshot({
    studyPlans: clone(plans.plans),
    planExecutions: clone(canonicalizePlanExecutions(plans.executions).executions),
    practiceRecords: clone(usePracticeStore.getState().records),
    timerRecords: clone(useTimerStore.getState().records),
    wordRecords: clone(useWordStore.getState().records),
  })
}

export function trackerPhase4bSnapshotFingerprint(snapshot: TrackerPhase4bLocalSnapshot): string {
  return stableTrackerPhase4bJson(snapshot)
}

/**
 * Installs a fully validated Phase 4B snapshot as one crash-recoverable local
 * transaction. Network work happens before this function; the canonical lock
 * therefore covers only short local reads and writes.
 */
export async function installTrackerPhase4bStoreSnapshot(input: {
  expectedFingerprint: string
  snapshot: TrackerPhase4bLocalSnapshot
  occurredAt?: string
  isCurrent?: () => boolean
}): Promise<TrackerPhase4bStoreInstallResult> {
  const desired = parseTrackerPhase4bLocalSnapshot(input.snapshot)
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const result = await withCanonicalMutationLock(async () => {
    const pending = readPendingLocalMutation()
    if (pending?.phase === 'prepared') {
      throw new Error('另一个页面正在保存学习记录，请稍后重试云端合并。')
    }
    const recovery = recoverPendingLocalMutation()
    if (recovery.status === 'conflict' || recovery.status === 'failed') {
      throw new Error(recovery.detail || '本机数据事务尚未恢复，云端合并已暂停。')
    }
    await rehydrateCanonicalStores()
    if (recovery.requiresLedgerRebuild) {
      rebuildActivityLedger(occurredAt, 'recovery')
    }

    const current = readTrackerPhase4bStoreSnapshot()
    if (input.isCurrent && !input.isCurrent()) {
      return { status: 'stale', snapshot: current } as const
    }
    if (trackerPhase4bSnapshotFingerprint(current) !== input.expectedFingerprint) {
      return { status: 'stale', snapshot: current } as const
    }
    if (sameValue(current, desired)) {
      return { status: 'unchanged', snapshot: current } as const
    }

    const planChanges = collectionChanges<StudyPlan>(current.studyPlans, desired.studyPlans)
    const executionChanges = collectionChanges<PlanExecution>(
      current.planExecutions,
      desired.planExecutions,
    )
    const practiceChanges = collectionChanges<PracticeRecord>(
      current.practiceRecords,
      desired.practiceRecords,
    )
    const timerChanges = collectionChanges<TimerRecord>(
      current.timerRecords,
      desired.timerRecords,
    )
    const wordChanges = collectionChanges<WordRecord>(current.wordRecords, desired.wordRecords)
    const planState = usePlanStore.getState()
    const practiceState = usePracticeStore.getState()
    const timerState = useTimerStore.getState()
    const wordState = useWordStore.getState()
    const planRevision = planState.mutationRevision + (planChanges.length || executionChanges.length ? 1 : 0)
    const practiceRevision = practiceState.mutationRevision + (practiceChanges.length ? 1 : 0)
    const timerRevision = timerState.mutationRevision + (timerChanges.length ? 1 : 0)
    const wordRevision = wordState.mutationRevision + (wordChanges.length ? 1 : 0)
    const domainPatches: LocalMutationPatch[] = []

    if (planChanges.length) {
      domainPatches.push(createEntityCollectionPatch({
        storage: localStorage,
        storageKey: PLAN_STORAGE_KEY,
        collection: 'plans',
        changes: planChanges,
      }))
    }
    if (executionChanges.length) {
      domainPatches.push(createEntityCollectionPatch({
        storage: localStorage,
        storageKey: PLAN_STORAGE_KEY,
        collection: 'executions',
        changes: executionChanges,
      }))
    }
    if (planChanges.length || executionChanges.length) {
      domainPatches.push(createStateFieldsPatch({
        storage: localStorage,
        storageKey: PLAN_STORAGE_KEY,
        beforeState: { mutationRevision: planState.mutationRevision },
        expectedAfterState: { mutationRevision: planRevision },
        fields: ['mutationRevision'],
      }))
    }
    if (practiceChanges.length) {
      domainPatches.push(
        createEntityCollectionPatch({
          storage: localStorage,
          storageKey: PRACTICE_STORAGE_KEY,
          collection: 'records',
          changes: practiceChanges,
        }),
        createStateFieldsPatch({
          storage: localStorage,
          storageKey: PRACTICE_STORAGE_KEY,
          beforeState: { mutationRevision: practiceState.mutationRevision },
          expectedAfterState: { mutationRevision: practiceRevision },
          fields: ['mutationRevision'],
        }),
      )
    }
    if (timerChanges.length) {
      domainPatches.push(
        createEntityCollectionPatch({
          storage: localStorage,
          storageKey: TIMER_STORAGE_KEY,
          collection: 'records',
          changes: timerChanges,
        }),
        createStateFieldsPatch({
          storage: localStorage,
          storageKey: TIMER_STORAGE_KEY,
          beforeState: { mutationRevision: timerState.mutationRevision },
          expectedAfterState: { mutationRevision: timerRevision },
          fields: ['mutationRevision'],
        }),
      )
    }
    if (wordChanges.length) {
      domainPatches.push(
        createEntityCollectionPatch({
          storage: localStorage,
          storageKey: WORD_STORAGE_KEY,
          collection: 'records',
          changes: wordChanges,
        }),
        createStateFieldsPatch({
          storage: localStorage,
          storageKey: WORD_STORAGE_KEY,
          beforeState: { mutationRevision: wordState.mutationRevision },
          expectedAfterState: { mutationRevision: wordRevision },
          fields: ['mutationRevision'],
        }),
      )
    }

    const transaction = createActivityTransactionPlan({
      action: 'sync.merge',
      domainPatches,
      events: [
        ...activityEvents<PlanExecution>('plan_execution', executionChanges, occurredAt),
        ...activityEvents<PracticeRecord>('practice_record', practiceChanges, occurredAt),
        ...activityEvents<TimerRecord>('timer_record', timerChanges, occurredAt),
        ...activityEvents<WordRecord>('word_record', wordChanges, occurredAt),
      ],
      achievements: useAchievementStore.getState(),
      streak: useStreakStore.getState(),
      lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
      createdAt: occurredAt,
    })
    const committed = commitActivityTransaction(transaction, () => {
      if (planChanges.length || executionChanges.length) {
        usePlanStore.setState({
          plans: clone(desired.studyPlans),
          executions: clone(desired.planExecutions),
          mutationRevision: planRevision,
        })
      }
      if (practiceChanges.length) {
        usePracticeStore.setState({
          records: clone(desired.practiceRecords),
          mutationRevision: practiceRevision,
        })
      }
      if (timerChanges.length) {
        useTimerStore.setState({
          records: clone(desired.timerRecords),
          mutationRevision: timerRevision,
        })
      }
      if (wordChanges.length) {
        useWordStore.setState({
          records: clone(desired.wordRecords),
          mutationRevision: wordRevision,
        })
      }
    })
    if (!committed) {
      // The journal has already restored canonical storage. Zustand setters
      // may have updated some in-memory stores before a later persisted write
      // failed, so rehydrate every participating store before releasing the
      // lock. The learner must never see a half-installed cloud snapshot while
      // the scheduled safety reload is still pending.
      await rehydrateCanonicalStores()
      throw new Error('云端学习数据未能完整写入本机。')
    }
    reconcileAchievementBadges()
    return { status: 'installed', snapshot: desired } as const
  })

  if (result.status === 'installed') announceCanonicalMutation('trackerCore', Date.now())
  return result
}
