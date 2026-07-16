import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WordRecord } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'

interface WordStore {
  records: WordRecord[]
  addRecord: (record: Omit<WordRecord, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateRecord: (id: string, data: Partial<Omit<WordRecord, 'id' | 'createdAt'>>) => void
  deleteRecord: (id: string) => void
  getRecordsByDate: (date: string) => WordRecord[]
  getRecordsByDateRange: (start: string, end: string) => WordRecord[]
}

const generateId = () => crypto.randomUUID()

export const useWordStore = create<WordStore>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (data) => {
        const now = new Date().toISOString()
        const record: WordRecord = {
          ...data,
          id: generateId(),
          createdAt: now,
          updatedAt: now,
        }
        set((state) => ({ records: [record, ...state.records] }))

        // 记录活动到热力图
        useStreakStore.getState().recordActivity(data.date)

        // 成就联动：添加 XP + 检测徽章
        // 动态导入避免循环依赖
        import('@/lib/achievementService').then(({ addXP, calculateWordXP, checkWordBadges }) => {
          const xpAmount = calculateWordXP(data.count)
          if (xpAmount !== 0) addXP(xpAmount)
          checkWordBadges()
        })
      },
      updateRecord: (id, data) => {
        const oldRecord = get().records.find((r) => r.id === id)
        const oldCount = oldRecord?.count ?? 0

        set((state) => ({
          records: state.records.map((r) =>
            r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
          ),
        }))

        // 成就联动：根据数量变化调整 XP + 检测徽章
        if (data.count !== undefined) {
          const delta = data.count - oldCount
          import('@/lib/achievementService').then(({ addXP, calculateWordXP, checkWordBadges }) => {
            const xpAmount = calculateWordXP(delta)
            if (xpAmount !== 0) addXP(xpAmount)
            checkWordBadges()
          })
        } else {
          // 即使数量没变化，也检查一下徽章（以防万一）
          import('@/lib/achievementService').then(({ checkWordBadges }) => {
            checkWordBadges()
          })
        }
      },
      deleteRecord: (id) => {
        const record = get().records.find((r) => r.id === id)
        const deletedCount = record?.count ?? 0

        set((state) => ({ records: state.records.filter((r) => r.id !== id) }))

        // 成就联动：扣除对应 XP + 检测徽章
        if (deletedCount > 0) {
          import('@/lib/achievementService').then(({ addXP, calculateWordXP, checkWordBadges }) => {
            const xpAmount = calculateWordXP(-deletedCount)
            if (xpAmount !== 0) addXP(xpAmount)
            checkWordBadges()
          })
        }
      },
      getRecordsByDate: (date) => {
        return get().records.filter((r) => r.date === date)
      },
      getRecordsByDateRange: (start, end) => {
        return get().records.filter((r) => r.date >= start && r.date <= end)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:wordRecords`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
