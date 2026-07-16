import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TimerRecord, TimerSubject } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'

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
        set((state) => ({ records: [record, ...state.records] }))

        // 记录活动到热力图
        useStreakStore.getState().recordActivity(data.date)

        // XP: 每30分钟 +15 XP（和模考一致）
        const minutes = Math.floor(data.duration / 60)
        if (minutes > 0) {
          import('@/lib/achievementService').then(({ addXP }) => {
            const xp = Math.floor((minutes / 30) * 15)
            if (xp > 0) addXP(xp)
          })
        }
      },

      updateRecord: (id, data) => {
        set((state) => ({
          records: state.records.map((r) =>
            r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
          ),
        }))
      },

      deleteRecord: (id) => {
        set((state) => ({ records: state.records.filter((r) => r.id !== id) }))
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
