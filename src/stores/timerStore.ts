import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TimerRecord, TimerSubject } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { commitActivityTransaction } from '@/data/activityTransactionRuntime'
import { createEntityCollectionPatch } from '@/data/localMutationJournal'

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

  // 计时器操作
  startTimer: (mode: TimerMode, subject: TimerSubject, minutes: number) => void
  pauseTimer: () => void
  resumeTimer: () => void
  stopTimer: () => number // 返回实际经过的秒数
  resetTimer: () => void
  tick: () => void // 每秒调用

  // 记录操作
  addRecord: (record: Omit<TimerRecord, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateRecord: (id: string, data: Partial<Omit<TimerRecord, 'id' | 'createdAt'>>) => void
  deleteRecord: (id: string) => void
  getRecordsByDateRange: (start: string, end: string) => TimerRecord[]
}

const generateId = () => crypto.randomUUID()
const TIMER_STORAGE_KEY = `${STORAGE_PREFIX}:timerRecords`

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      // 计时器状态
      status: 'idle',
      mode: 'countdown',
      subject: 'general',
      presetMinutes: 25,
      remainingSeconds: 0,
      elapsedSeconds: 0,

      // 记录列表
      records: [],

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
      addRecord: (data) => {
        const now = new Date().toISOString()
        const record: TimerRecord = { ...data, id: generateId(), createdAt: now, updatedAt: now }
        const plan = createActivityTransactionPlan({
          action: 'timer.create',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: TIMER_STORAGE_KEY,
            collection: 'records',
            changes: [{ id: record.id, before: null, beforeIndex: 0, expectedAfter: record }],
          })],
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
          set((state) => ({ records: [record, ...state.records] }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
          checkPracticeBadges()
        })
      },

      updateRecord: (id, data) => {
        const oldRecord = get().records.find((r) => r.id === id)
        if (!oldRecord) return
        const now = new Date().toISOString()
        const nextRecord: TimerRecord = { ...oldRecord, ...data, updatedAt: now }

        const beforeIndex = get().records.findIndex((record) => record.id === id)
        const plan = createActivityTransactionPlan({
          action: 'timer.update',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: TIMER_STORAGE_KEY,
            collection: 'records',
            changes: [{ id, before: oldRecord, beforeIndex, expectedAfter: nextRecord }],
          })],
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
          set((state) => ({
            records: state.records.map((record) => (record.id === id ? nextRecord : record)),
          }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
          checkPracticeBadges()
        })
      },

      deleteRecord: (id) => {
        const record = get().records.find((r) => r.id === id)
        if (!record) return
        const occurredAt = new Date().toISOString()
        const beforeIndex = get().records.findIndex((candidate) => candidate.id === id)
        const plan = createActivityTransactionPlan({
          action: 'timer.delete',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: TIMER_STORAGE_KEY,
            collection: 'records',
            changes: [{ id, before: record, beforeIndex, expectedAfter: null }],
          })],
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
          set((state) => ({ records: state.records.filter((candidate) => candidate.id !== id) }))
        })
        if (!committed) return
        import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
          checkPracticeBadges()
        })
      },

      getRecordsByDateRange: (start, end) => {
        return get().records.filter((r) => r.date >= start && r.date <= end)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:timerRecords`,
      storage: createJSONStorage(() => localStorage),
      // 计时器状态不持久化（刷新后重置），只持久化记录
      partialize: (state) => ({ records: state.records }),
    }
  )
)
