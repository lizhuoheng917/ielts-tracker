import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TimerRecord, TimerSubject } from '@/lib/types'
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

export type TimerMutationStatus = 'applied' | 'not_found' | 'busy' | 'failed'

export interface TimerMutationResult {
  status: TimerMutationStatus
  targetId?: string
  error?: { code: string; message: string }
}

// ===== 计时器状态 =====
export type TimerMode = 'countdown' | 'stopwatch'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

interface TimerState {
  status: TimerStatus
  mode: TimerMode
  subject: TimerSubject
  presetMinutes: number
  remainingSeconds: number // 倒计时剩余秒数（countdown 模式）
  elapsedSeconds: number // 已经过的秒数（stopwatch 模式）
  startedAt?: string // ISO datetime，用于恢复计时
}

// ===== Store =====
interface TimerStore extends TimerState {
  records: TimerRecord[]
  mutationRevision: number

  // 计时器操作
  startTimer: (mode: TimerMode, subject: TimerSubject, minutes: number) => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => number // 返回实际经过的秒数
  resetTimer: () => void
  tick: () => void // 每秒调用

  // 记录操作
  addRecord: (record: Omit<TimerRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TimerMutationResult>
  updateRecord: (id: string, data: Partial<Omit<TimerRecord, 'id' | 'createdAt'>>) => Promise<TimerMutationResult>
  deleteRecord: (id: string) => Promise<TimerMutationResult>
  getRecordsByDateRange: (start: string, end: string) => TimerRecord[]
}

const generateId = () => crypto.randomUUID()
const TIMER_STORAGE_KEY = `${STORAGE_PREFIX}:timerRecords`
const TIMER_MUTATION_SCOPE = 'timerRecords'

let observedCanonicalMutationEpoch = readCanonicalMutationEpoch()

function failedMutation(error: unknown): TimerMutationResult {
  const busy = error instanceof CanonicalMutationBusyError
  return {
    status: busy ? 'busy' : 'failed',
    error: {
      code: busy ? 'CANONICAL_MUTATION_BUSY' : 'TIMER_MUTATION_FAILED',
      message: busy ? error.message : '练习记录暂时无法保存，请稍后重试。',
    },
  }
}

async function rehydrateTimerMutationStores(): Promise<void> {
  const { usePracticeStore } = await import('@/stores/practiceStore')
  await Promise.all([
      Promise.resolve(useTimerStore.persist.rehydrate()),
      Promise.resolve(usePracticeStore.persist.rehydrate()),
      Promise.resolve(useAchievementStore.persist.rehydrate()),
      Promise.resolve(useStreakStore.persist.rehydrate()),
      Promise.resolve(useSettingsStore.persist.rehydrate()),
      Promise.resolve(useActivityLedgerStore.persist.rehydrate()),
  ])
}

async function withFreshTimerMutation<T>(task: () => T | PromiseLike<T>): Promise<T> {
  return withCanonicalMutationLock(async () => {
    const currentEpoch = readCanonicalMutationEpoch()
    if (currentEpoch !== observedCanonicalMutationEpoch) {
      throw new CanonicalMutationBusyError('数据已在另一个页面整体更新，请刷新后再继续。')
    }
    const pending = readPendingLocalMutation()
    if (pending?.phase === 'prepared' && !pending.action.startsWith('timer.')) {
      throw new CanonicalMutationBusyError('另一个页面正在保存学习记录，请稍后重试。')
    }
    const recovery = recoverPendingLocalMutation()
    if (recovery.status === 'conflict' || recovery.status === 'failed') {
      throw new Error(recovery.detail || '检测到未完成的数据事务，请重新加载后重试。')
    }
    await rehydrateTimerMutationStores()
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
    try {
      await Promise.resolve(useAchievementStore.persist.rehydrate())
    } catch {
      // Keep the committed timer record authoritative. The derived badge can be
      // reconciled later if its persisted store is temporarily unavailable.
    }
    console.warn('[timer-badges] deferred badge reconciliation after local write failure', error)
  }
}

function timerRevisionPatch(beforeRevision: number, afterRevision: number) {
  return createStateFieldsPatch({
    storage: localStorage,
    storageKey: TIMER_STORAGE_KEY,
    beforeState: { mutationRevision: beforeRevision },
    expectedAfterState: { mutationRevision: afterRevision },
    fields: ['mutationRevision'],
  })
}

function announceTimerRevision(): void {
  announceCanonicalMutation(TIMER_MUTATION_SCOPE, useTimerStore.getState().mutationRevision)
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => {
      const restoreEnvelope = (records: TimerRecord[], mutationRevision: number): void => {
        try {
          set({ records, mutationRevision })
        } catch {
          // Zustand updates memory before persistence. Preserve the pre-mutation
          // visible snapshot even when the repair write also fails.
        }
      }

      const setEnvelope = (
        updater: (state: TimerStore) => Partial<TimerStore>,
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
      // 计时器状态
      status: 'idle',
      mode: 'countdown',
      subject: 'general',
      presetMinutes: 25,
      remainingSeconds: 0,
      elapsedSeconds: 0,

      // 记录列表
      records: [],
      mutationRevision: 0,

      startTimer: (mode, subject, minutes) => {
        const now = new Date().toISOString()
        set({
          status: 'running',
          mode,
          subject,
          presetMinutes: minutes,
          remainingSeconds: mode === 'countdown' ? minutes * 60 : 0,
          elapsedSeconds: 0,
          startedAt: now,
        })
      },

      pauseTimer: () => {
        set({ status: 'paused' })
      },

      resumeTimer: () => {
        set({ status: 'running' })
      },

      stopTimer: () => {
        const state = get()
        set({
          status: 'idle',
          remainingSeconds: 0,
          elapsedSeconds: 0,
          startedAt: undefined,
        })
        // 返回实际经过的秒数
        return state.elapsedSeconds || (state.presetMinutes * 60 - state.remainingSeconds)
      },

      resetTimer: () => {
        set({
          status: 'idle',
          remainingSeconds: 0,
          elapsedSeconds: 0,
          startedAt: undefined,
        })
      },

      tick: () => {
        const state = get()
        if (state.status !== 'running') return

        if (state.mode === 'countdown') {
          const newRemaining = state.remainingSeconds - 1
          if (newRemaining <= 0) {
            set({ status: 'finished', remainingSeconds: 0, elapsedSeconds: state.presetMinutes * 60 })
          } else {
            set({ remainingSeconds: newRemaining, elapsedSeconds: state.presetMinutes * 60 - newRemaining })
          }
        } else {
          set({ elapsedSeconds: state.elapsedSeconds + 1 })
        }
      },

        // 记录操作
        addRecord: async (data) => {
          try {
            const result = await withFreshTimerMutation(async () => {
              const before = get()
              const nextRevision = before.mutationRevision + 1
              const now = new Date().toISOString()
              const record: TimerRecord = {
                ...data,
                id: generateId(),
                createdAt: now,
                updatedAt: now,
              }
              const plan = createActivityTransactionPlan({
                action: 'timer.create',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: TIMER_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id: record.id, before: null, beforeIndex: 0, expectedAfter: record }],
                  }),
                  timerRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'timer_record',
                  entityId: record.id,
                  operation: 'created',
                  effectiveDate: record.date,
                  occurredAt: now,
                  source: 'timer',
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
                await rehydrateTimerMutationStores()
                throw new Error('练习记录的数据事务未提交。')
              }
              await checkPracticeBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: record.id } satisfies TimerMutationResult
            })
            announceTimerRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },

        updateRecord: async (id, data) => {
          try {
            const result = await withFreshTimerMutation(async () => {
              const before = get()
              const oldRecord = before.records.find((record) => record.id === id)
              if (!oldRecord) return { status: 'not_found' } satisfies TimerMutationResult

              const nextRevision = before.mutationRevision + 1
              const now = new Date().toISOString()
              const nextRecord: TimerRecord = { ...oldRecord, ...data, updatedAt: now }
              const beforeIndex = before.records.findIndex((record) => record.id === id)
              const plan = createActivityTransactionPlan({
                action: 'timer.update',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: TIMER_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id, before: oldRecord, beforeIndex, expectedAfter: nextRecord }],
                  }),
                  timerRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'timer_record',
                  entityId: id,
                  operation: 'updated',
                  effectiveDate: nextRecord.date,
                  occurredAt: now,
                  source: 'timer',
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
                await rehydrateTimerMutationStores()
                throw new Error('练习记录的数据事务未提交。')
              }
              await checkPracticeBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: id } satisfies TimerMutationResult
            })
            if (result.status === 'applied') announceTimerRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },

        deleteRecord: async (id) => {
          try {
            const result = await withFreshTimerMutation(async () => {
              const before = get()
              const record = before.records.find((candidate) => candidate.id === id)
              if (!record) return { status: 'not_found' } satisfies TimerMutationResult

              const nextRevision = before.mutationRevision + 1
              const occurredAt = new Date().toISOString()
              const beforeIndex = before.records.findIndex((candidate) => candidate.id === id)
              const plan = createActivityTransactionPlan({
                action: 'timer.delete',
                domainPatches: [
                  createEntityCollectionPatch({
                    storage: localStorage,
                    storageKey: TIMER_STORAGE_KEY,
                    collection: 'records',
                    changes: [{ id, before: record, beforeIndex, expectedAfter: null }],
                  }),
                  timerRevisionPatch(before.mutationRevision, nextRevision),
                ],
                events: [{
                  entityKind: 'timer_record',
                  entityId: id,
                  operation: 'deleted',
                  effectiveDate: record.date,
                  occurredAt,
                  source: 'timer',
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
                await rehydrateTimerMutationStores()
                throw new Error('练习记录的数据事务未提交。')
              }
              await checkPracticeBadgesWithinCanonicalLock()
              return { status: 'applied', targetId: id } satisfies TimerMutationResult
            })
            if (result.status === 'applied') announceTimerRevision()
            return result
          } catch (error) {
            return failedMutation(error)
          }
        },

        getRecordsByDateRange: (start, end) => (
          get().records.filter((record) => record.date >= start && record.date <= end)
        ),
      }
    },
    {
      name: `${STORAGE_PREFIX}:timerRecords`,
      storage: createJSONStorage(() => localStorage),
      // 计时器状态不持久化（刷新后重置），只持久化记录
      partialize: (state) => ({
        records: state.records,
        mutationRevision: state.mutationRevision,
      }),
    }
  )
)
