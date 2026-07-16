import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { PracticeRecord } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useStreakStore } from '@/stores/streakStore'

interface PracticeStore {
  records: PracticeRecord[]
  addRecord: (record: Omit<PracticeRecord, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateRecord: (id: string, data: Partial<Omit<PracticeRecord, 'id' | 'createdAt'>>) => void
  deleteRecord: (id: string) => void
  getRecordsByType: (type: PracticeRecord['type']) => PracticeRecord[]
  getRecordsByDateRange: (start: string, end: string) => PracticeRecord[]
}

const generateId = () => crypto.randomUUID()

export const usePracticeStore = create<PracticeStore>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (data) => {
        const now = new Date().toISOString()
        const record: PracticeRecord = { ...data, id: generateId(), createdAt: now, updatedAt: now }
        set((state) => ({ records: [record, ...state.records] }))

        // 记录活动到热力图
        useStreakStore.getState().recordActivity(data.date)

        // 成就联动：添加 XP + 检测徽章
        import('@/lib/achievementService').then(
          ({ addXP, calculatePracticeXP, checkPracticeBadges }) => {
            const xpAmount = calculatePracticeXP(data.duration)
            if (xpAmount !== 0) addXP(xpAmount)
            checkPracticeBadges()
          }
        )
      },
      updateRecord: (id, data) => {
        const oldRecord = get().records.find((r) => r.id === id)
        const oldDuration = oldRecord?.duration ?? 0

        set((state) => ({
          records: state.records.map((r) =>
            r.id === id ? { ...r, ...data, updatedAt: new Date().toISOString() } : r
          ),
        }))

        // 成就联动：根据时长变化调整 XP + 检测徽章
        if (data.duration !== undefined) {
          const delta = data.duration - oldDuration
          import('@/lib/achievementService').then(
            ({ addXP, calculatePracticeXP, checkPracticeBadges }) => {
              const xpAmount = calculatePracticeXP(delta)
              if (xpAmount !== 0) addXP(xpAmount)
              checkPracticeBadges()
            }
          )
        } else {
          // 即使时长没变化，也检查徽章（比如 type 变了）
          import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
            checkPracticeBadges()
          })
        }
      },
      deleteRecord: (id) => {
        const record = get().records.find((r) => r.id === id)
        const deletedDuration = record?.duration ?? 0

        set((state) => ({ records: state.records.filter((r) => r.id !== id) }))

        // 成就联动：扣除对应 XP + 检测徽章
        if (deletedDuration > 0) {
          import('@/lib/achievementService').then(
            ({ addXP, calculatePracticeXP, checkPracticeBadges }) => {
              const xpAmount = calculatePracticeXP(-deletedDuration)
              if (xpAmount !== 0) addXP(xpAmount)
              checkPracticeBadges()
            }
          )
        } else {
          import('@/lib/achievementService').then(({ checkPracticeBadges }) => {
            checkPracticeBadges()
          })
        }
      },
      getRecordsByType: (type) => {
        return get().records.filter((r) => r.type === type)
      },
      getRecordsByDateRange: (start, end) => {
        return get().records.filter((r) => r.date >= start && r.date <= end)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:practiceRecords`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
