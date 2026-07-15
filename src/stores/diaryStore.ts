import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { DiaryEntry } from '@/lib/types'
import { STORAGE_PREFIX, XP_RULES } from '@/lib/constants'

interface DiaryStore {
  entries: DiaryEntry[]
  addEntry: (entry: Omit<DiaryEntry, 'id' | 'createdAt' | 'updatedAt'>) => void
  updateEntry: (id: string, data: Partial<Omit<DiaryEntry, 'id' | 'createdAt'>>) => void
  deleteEntry: (id: string) => void
  getEntryByDate: (date: string) => DiaryEntry | undefined
}

const generateId = () => crypto.randomUUID()

export const useDiaryStore = create<DiaryStore>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (data) => {
        const now = new Date().toISOString()
        const entry: DiaryEntry = { ...data, id: generateId(), createdAt: now, updatedAt: now }
        set((state) => ({ entries: [entry, ...state.entries] }))

        // 成就联动：添加日记 XP + 检测徽章
        import('@/lib/achievementService').then(({ addXP, checkDiaryBadges }) => {
          addXP(XP_RULES.DIARY)
          checkDiaryBadges()
        })
      },
      updateEntry: (id, data) => {
        set((state) => ({
          entries: state.entries.map((e) =>
            e.id === id ? { ...e, ...data, updatedAt: new Date().toISOString() } : e
          ),
        }))

        // 编辑日记时也检查一下徽章（虽然数量没变，但保持一致性）
        import('@/lib/achievementService').then(({ checkDiaryBadges }) => {
          checkDiaryBadges()
        })
      },
      deleteEntry: (id) => {
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) }))

        // 成就联动：扣除日记 XP + 检测徽章
        import('@/lib/achievementService').then(({ addXP, checkDiaryBadges }) => {
          addXP(-XP_RULES.DIARY)
          checkDiaryBadges()
        })
      },
      getEntryByDate: (date) => {
        return get().entries.find((e) => e.date === date)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:diaryEntries`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
