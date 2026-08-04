import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  announceCanonicalMutation,
  CanonicalMutationBusyError,
  readCanonicalMutationEpoch,
  withCanonicalMutationLock,
} from '@/data/canonicalMutationCoordinator'
import { rebuildActivityLedger } from '@/data/activityLedgerBootstrap'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import {
  createEntityCollectionPatch,
  createStateFieldsPatch,
  readPendingLocalMutation,
  recoverPendingLocalMutation,
} from '@/data/localMutationJournal'
import { STORAGE_PREFIX } from '@/lib/constants'
import type { WordRecord } from '@/lib/types'
import { useAchievementStore } from '@/stores/achievementStore'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'

export type WordMutationStatus = 'applied' | 'not_found' | 'busy' | 'failed'

export interface WordMutationResult {
  status: WordMutationStatus
  targetId?: string
  error?: { code: string; message: string }
}

interface WordStore {
  records: WordRecord[]
  /** Monotonic local signal used to coalesce compact cloud-sync batches. */
  mutationRevision: number
  addRecord: (
    record: Omit<WordRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ) => Promise<WordMutationResult>
  updateRecord: (
    id: string,
    data: Partial<Omit<WordRecord, 'id' | 'createdAt'>>,
  ) => Promise<WordMutationResult>
  deleteRecord: (id: string) => Promise<WordMutationResult>
  getRecordsByDate: (date: string) => WordRecord[]
  getRecordsByDateRange: (start: string, end: string) => WordRecord[]
}

const generateId = () => crypto.randomUUID()
const WORD_STORAGE_KEY = `${STORAGE_PREFIX}:wordRecords`
const WORD_MUTATION_SCOPE = 'wordRecords'

let observedCanonicalMutationEpoch = readCanonicalMutationEpoch()

function failedMutation(error: unknown): WordMutationResult {
  const busy = error instanceof CanonicalMutationBusyError
  return {
    status: busy ? 'busy' : 'failed',
    error: {
      code: busy ? 'CANONICAL_MUTATION_BUSY' : 'WORD_MUTATION_FAILED',
      message: busy
        ? error.message
        : '单词记录暂时无法保存，请稍后重试。',
    },
  }
}

async function rehydrateWordMutationStores(): Promise<void> {
  await Promise.all([
    Promise.resolve(useWordStore.persist.rehydrate()),
    Promise.resolve(useAchievementStore.persist.rehydrate()),
    Promise.resolve(useStreakStore.persist.rehydrate()),
    Promise.resolve(useSettingsStore.persist.rehydrate()),
    Promise.resolve(useActivityLedgerStore.persist.rehydrate()),
  ])
}

async function withFreshWordMutation<T>(task: () => T | PromiseLike<T>): Promise<T> {
  return withCanonicalMutationLock(async () => {
    if (readCanonicalMutationEpoch() !== observedCanonicalMutationEpoch) {
      throw new CanonicalMutationBusyError('数据已在另一个页面整体更新，请刷新后再继续。')
    }
    const pending = readPendingLocalMutation()
    if (pending?.phase === 'prepared' && !pending.action.startsWith('word.')) {
      throw new CanonicalMutationBusyError('另一个页面正在保存学习记录，请稍后重试。')
    }
    const recovery = recoverPendingLocalMutation()
    if (recovery.status === 'conflict' || recovery.status === 'failed') {
      throw new Error(recovery.detail || '检测到未完成的数据事务，请重新加载后重试。')
    }
    await rehydrateWordMutationStores()
    if (recovery.requiresLedgerRebuild) {
      rebuildActivityLedger(new Date().toISOString(), 'recovery')
    }
    return task()
  })
}

async function checkWordBadgesWithinCanonicalLock(): Promise<void> {
  try {
    const { checkWordBadges } = await import('@/lib/achievementService')
    checkWordBadges()
  } catch (error) {
    // Badges are derived and repairable. The word record has already committed,
    // so recover the last persisted badge state instead of reporting a false
    // record-save failure.
    try {
      await Promise.resolve(useAchievementStore.persist.rehydrate())
    } catch {
      // Startup reconciliation can repair the derived badge state later.
    }
    console.warn('[word-badges] deferred badge reconciliation after local write failure', error)
  }
}

function wordRevisionPatch(beforeRevision: number, afterRevision: number) {
  return createStateFieldsPatch({
    storage: localStorage,
    storageKey: WORD_STORAGE_KEY,
    beforeState: { mutationRevision: beforeRevision },
    expectedAfterState: { mutationRevision: afterRevision },
    fields: ['mutationRevision'],
  })
}

function announceWordRevision(): void {
  announceCanonicalMutation(WORD_MUTATION_SCOPE, useWordStore.getState().mutationRevision)
}

export const useWordStore = create<WordStore>()(
  persist(
    (set, get) => {
      const restoreEnvelope = (records: WordRecord[], mutationRevision: number): void => {
        try {
          set({ records, mutationRevision })
        } catch {
          // Zustand may update memory before a later persisted write fails.
          // Keep the visible state at the pre-mutation envelope either way.
        }
      }

      const setEnvelope = (updater: (state: WordStore) => Partial<WordStore>): void => {
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
            const result = await withFreshWordMutation(async () => {
              const before = get()
              const nextRevision = before.mutationRevision + 1
              const now = new Date().toISOString()
              const record: WordRecord = {
                ...data,
                id: generateId(),
                createdAt: now,
                updatedAt: now,
              }
              const plan = createActivityTransactionPlan({
                action: 'word.create',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: WORD_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id: record.id, before: null, beforeIndex: 0, expectedAfter: record }],
                  }),
                  wordRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'word_record',
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
                await rehydrateWordMutationStores()
                throw new Error('单词记录的数据事务未提交。')
              }
              await checkWordBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: record.id } satisfies WordMutationResult
            })
            announceWordRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },
        updateRecord: async (id, data) => {
          try {
            const result = await withFreshWordMutation(async () => {
              const before = get()
              const oldRecord = before.records.find((record) => record.id === id)
              if (!oldRecord) return { status: 'not_found' } satisfies WordMutationResult

              const nextRevision = before.mutationRevision + 1
              const now = new Date().toISOString()
              const nextRecord: WordRecord = { ...oldRecord, ...data, updatedAt: now }
              const beforeIndex = before.records.findIndex((record) => record.id === id)
              const plan = createActivityTransactionPlan({
                action: 'word.update',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: WORD_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id, before: oldRecord, beforeIndex, expectedAfter: nextRecord }],
                  }),
                  wordRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'word_record',
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
                  records: state.records.map((record) => (
                    record.id === id ? nextRecord : record
                  )),
                  mutationRevision: nextRevision,
                }))
              })
              if (!committed) {
                restoreEnvelope(before.records, before.mutationRevision)
                await rehydrateWordMutationStores()
                throw new Error('单词记录的数据事务未提交。')
              }
              await checkWordBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: id } satisfies WordMutationResult
            })
            announceWordRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },
        deleteRecord: async (id) => {
          try {
            const result = await withFreshWordMutation(async () => {
              const before = get()
              const record = before.records.find((candidate) => candidate.id === id)
              if (!record) return { status: 'not_found' } satisfies WordMutationResult

              const nextRevision = before.mutationRevision + 1
              const occurredAt = new Date().toISOString()
              const beforeIndex = before.records.findIndex((candidate) => candidate.id === id)
              const plan = createActivityTransactionPlan({
                action: 'word.delete',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: WORD_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id, before: record, beforeIndex, expectedAfter: null }],
                  }),
                  wordRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'word_record',
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
                await rehydrateWordMutationStores()
                throw new Error('单词记录的数据事务未提交。')
              }
              await checkWordBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: id } satisfies WordMutationResult
            })
            announceWordRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },
        getRecordsByDate: (date) => get().records.filter((record) => record.date === date),
        getRecordsByDateRange: (start, end) => get().records.filter((record) => (
          record.date >= start && record.date <= end
        )),
      }
    },
    {
      name: WORD_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
