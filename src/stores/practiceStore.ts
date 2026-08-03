import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PracticeRecord } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { rebuildActivityLedger } from '@/data/activityLedgerBootstrap'
import {
  announceCanonicalMutation,
  CanonicalMutationBusyError,
  readCanonicalMutationEpoch,
  withCanonicalMutationLock,
} from '@/data/canonicalMutationCoordinator'
import {
  createEntityCollectionPatch,
  createStateFieldsPatch,
  readPendingLocalMutation,
  recoverPendingLocalMutation,
} from '@/data/localMutationJournal'

export type PracticeMutationStatus = 'applied' | 'not_found' | 'busy' | 'failed'

export interface PracticeMutationResult {
  status: PracticeMutationStatus
  targetId?: string
  error?: { code: string; message: string }
}

interface PracticeStore {
  records: PracticeRecord[]
  mutationRevision: number
  addRecord: (record: Omit<PracticeRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PracticeMutationResult>
  updateRecord: (id: string, data: Partial<Omit<PracticeRecord, 'id' | 'createdAt'>>) => Promise<PracticeMutationResult>
  deleteRecord: (id: string) => Promise<PracticeMutationResult>
  getRecordsByType: (type: PracticeRecord['type']) => PracticeRecord[]
  getRecordsByDateRange: (start: string, end: string) => PracticeRecord[]
}

const generateId = () => crypto.randomUUID()
const PRACTICE_STORAGE_KEY = `${STORAGE_PREFIX}:practiceRecords`
const PRACTICE_MUTATION_SCOPE = 'practiceRecords'

let observedCanonicalMutationEpoch = readCanonicalMutationEpoch()

function failedMutation(error: unknown): PracticeMutationResult {
  const busy = error instanceof CanonicalMutationBusyError
  return {
    status: busy ? 'busy' : 'failed',
    error: {
      code: busy ? 'CANONICAL_MUTATION_BUSY' : 'PRACTICE_MUTATION_FAILED',
      message: busy ? error.message : '模考记录暂时无法保存，请稍后重试。',
    },
  }
}

async function rehydratePracticeMutationStores(): Promise<void> {
  const { useTimerStore } = await import('@/stores/timerStore')
  await Promise.all([
      Promise.resolve(usePracticeStore.persist.rehydrate()),
      Promise.resolve(useTimerStore.persist.rehydrate()),
      Promise.resolve(useAchievementStore.persist.rehydrate()),
      Promise.resolve(useStreakStore.persist.rehydrate()),
      Promise.resolve(useSettingsStore.persist.rehydrate()),
      Promise.resolve(useActivityLedgerStore.persist.rehydrate()),
  ])
}

async function withFreshPracticeMutation<T>(task: () => T | PromiseLike<T>): Promise<T> {
  return withCanonicalMutationLock(async () => {
    const currentEpoch = readCanonicalMutationEpoch()
    if (currentEpoch !== observedCanonicalMutationEpoch) {
      throw new CanonicalMutationBusyError('数据已在另一个页面整体更新，请刷新后再继续。')
    }
    const pending = readPendingLocalMutation()
    if (pending?.phase === 'prepared' && !pending.action.startsWith('practice.')) {
      throw new CanonicalMutationBusyError('另一个页面正在保存学习记录，请稍后重试。')
    }
    const recovery = recoverPendingLocalMutation()
    if (recovery.status === 'conflict' || recovery.status === 'failed') {
      throw new Error(recovery.detail || '检测到未完成的数据事务，请重新加载后重试。')
    }
    await rehydratePracticeMutationStores()
    if (recovery.requiresLedgerRebuild) {
      rebuildActivityLedger(new Date().toISOString(), 'recovery')
    }
    return task()
  })
}

async function checkPracticeBadgesWithinCanonicalLock(): Promise<void> {
  try {
    const { checkPracticeBadges } = await import('@/lib/achievementService')
    checkPracticeBadges()
  } catch (error) {
    // Badge state is derived and repairable. Restore the last persisted snapshot
    // if a badge write fails instead of letting an optional badge turn a committed
    // practice record into a misleading save failure.
    try {
      await Promise.resolve(useAchievementStore.persist.rehydrate())
    } catch {
      // The canonical record is already committed; startup reconciliation can
      // repair this derived badge even when its store cannot be read right now.
    }
    console.warn('[practice-badges] deferred badge reconciliation after local write failure', error)
  }
}

function practiceRevisionPatch(beforeRevision: number, afterRevision: number) {
  return createStateFieldsPatch({
    storage: localStorage,
    storageKey: PRACTICE_STORAGE_KEY,
    beforeState: { mutationRevision: beforeRevision },
    expectedAfterState: { mutationRevision: afterRevision },
    fields: ['mutationRevision'],
  })
}

function announcePracticeRevision(): void {
  announceCanonicalMutation(PRACTICE_MUTATION_SCOPE, usePracticeStore.getState().mutationRevision)
}

export const usePracticeStore = create<PracticeStore>()(
  persist(
    (set, get) => {
      const restoreEnvelope = (records: PracticeRecord[], mutationRevision: number): void => {
        try {
          set({ records, mutationRevision })
        } catch {
          // Zustand updates memory before persistence. Even if the repair write
          // also fails, the visible snapshot must return to the pre-mutation state.
        }
      }

      const setEnvelope = (
        updater: (state: PracticeStore) => Partial<PracticeStore>,
      ): void => {
        const before = get()
        try {
          set(updater)
        } catch (error) {
          restoreEnvelope(before.records, before.mutationRevision)
          throw error
        }
      }

      return {
        records: [],
        mutationRevision: 0,
        addRecord: async (data) => {
          try {
            const result = await withFreshPracticeMutation(async () => {
              const before = get()
              const nextRevision = before.mutationRevision + 1
              const now = new Date().toISOString()
              const record: PracticeRecord = {
                ...data,
                id: generateId(),
                createdAt: now,
                updatedAt: now,
              }
              const plan = createActivityTransactionPlan({
                action: 'practice.create',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: PRACTICE_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id: record.id, before: null, beforeIndex: 0, expectedAfter: record }],
                  }),
                  practiceRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'practice_record',
                  entityId: record.id,
                  operation: 'created',
                  effectiveDate: record.date,
                  occurredAt: now,
                  source: 'user',
                  after: record,
                }],
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: now,
              })
              const committed = commitActivityTransaction(plan, () => {
                setEnvelope((state) => ({
                  records: [record, ...state.records],
                  mutationRevision: nextRevision,
                }))
              })
              if (!committed) {
                restoreEnvelope(before.records, before.mutationRevision)
                await rehydratePracticeMutationStores()
                throw new Error('模考记录的数据事务未提交。')
              }
              await checkPracticeBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: record.id } satisfies PracticeMutationResult
            })
            announcePracticeRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },
        updateRecord: async (id, data) => {
          try {
            const result = await withFreshPracticeMutation(async () => {
              const before = get()
              const oldRecord = before.records.find((record) => record.id === id)
              if (!oldRecord) return { status: 'not_found' } satisfies PracticeMutationResult

              const nextRevision = before.mutationRevision + 1
              const now = new Date().toISOString()
              const nextRecord: PracticeRecord = { ...oldRecord, ...data, updatedAt: now }
              const beforeIndex = before.records.findIndex((record) => record.id === id)
              const plan = createActivityTransactionPlan({
                action: 'practice.update',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: PRACTICE_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id, before: oldRecord, beforeIndex, expectedAfter: nextRecord }],
                  }),
                  practiceRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'practice_record',
                  entityId: id,
                  operation: 'updated',
                  effectiveDate: nextRecord.date,
                  occurredAt: now,
                  source: 'user',
                  before: oldRecord,
                  after: nextRecord,
                }],
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: now,
              })
              const committed = commitActivityTransaction(plan, () => {
                setEnvelope((state) => ({
                  records: state.records.map((record) => (record.id === id ? nextRecord : record)),
                  mutationRevision: nextRevision,
                }))
              })
              if (!committed) {
                restoreEnvelope(before.records, before.mutationRevision)
                await rehydratePracticeMutationStores()
                throw new Error('模考记录的数据事务未提交。')
              }
              await checkPracticeBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: id } satisfies PracticeMutationResult
            })
            if (result.status === 'applied') announcePracticeRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },
        deleteRecord: async (id) => {
          try {
            const result = await withFreshPracticeMutation(async () => {
              const before = get()
              const record = before.records.find((candidate) => candidate.id === id)
              if (!record) return { status: 'not_found' } satisfies PracticeMutationResult

              const nextRevision = before.mutationRevision + 1
              const occurredAt = new Date().toISOString()
              const beforeIndex = before.records.findIndex((candidate) => candidate.id === id)
              const plan = createActivityTransactionPlan({
                action: 'practice.delete',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: PRACTICE_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id, before: record, beforeIndex, expectedAfter: null }],
                  }),
                  practiceRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'practice_record',
                  entityId: id,
                  operation: 'deleted',
                  effectiveDate: record.date,
                  occurredAt,
                  source: 'user',
                  before: record,
                }],
                achievements: useAchievementStore.getState(),
                streak: useStreakStore.getState(),
                lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
                createdAt: occurredAt,
              })
              const committed = commitActivityTransaction(plan, () => {
                setEnvelope((state) => ({
                  records: state.records.filter((candidate) => candidate.id !== id),
                  mutationRevision: nextRevision,
                }))
              })
              if (!committed) {
                restoreEnvelope(before.records, before.mutationRevision)
                await rehydratePracticeMutationStores()
                throw new Error('模考记录的数据事务未提交。')
              }
              await checkPracticeBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: id } satisfies PracticeMutationResult
            })
            if (result.status === 'applied') announcePracticeRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },
        getRecordsByType: (type) => get().records.filter((record) => record.type === type),
        getRecordsByDateRange: (start, end) => (
          get().records.filter((record) => record.date >= start && record.date <= end)
        ),
      }
    },
    {
      name: `${STORAGE_PREFIX}:practiceRecords`,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        records: state.records,
        mutationRevision: state.mutationRevision,
      }),
    }
  )
)
