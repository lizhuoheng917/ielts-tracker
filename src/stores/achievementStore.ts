import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AchievementState } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_ACHIEVEMENT_STATE, LEVELS, BADGES } from '@/lib/constants'

interface AchievementStore extends AchievementState {
  addXP: (amount: number) => void
  unlockBadge: (badgeId: string) => boolean // returns true if newly unlocked
  isBadgeUnlocked: (badgeId: string) => boolean
  incrementStatsView: () => number // 返回新的计数
  getCurrentLevel: () => { level: number; name: string; requiredXP: number; nextXP?: number }
  getXPProgress: () => { current: number; required: number; percentage: number }
}

export const useAchievementStore = create<AchievementStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_ACHIEVEMENT_STATE,
      addXP: (amount) => {
        set((state) => {
          const newTotal = state.totalXP + amount
          // 计算新等级
          let newLevel = state.level
          for (let i = LEVELS.length - 1; i >= 0; i--) {
            if (newTotal >= LEVELS[i].requiredXP) {
              newLevel = LEVELS[i].level
              break
            }
          }
          return { totalXP: newTotal, level: newLevel }
        })
      },
      unlockBadge: (badgeId) => {
        const state = get()
        if (state.unlockedBadges.includes(badgeId)) return false
        const badge = BADGES.find((b) => b.id === badgeId)
        if (!badge) return false
        set((state) => ({
          unlockedBadges: [...state.unlockedBadges, badgeId],
        }))
        return true
      },
      isBadgeUnlocked: (badgeId) => {
        return get().unlockedBadges.includes(badgeId)
      },
      incrementStatsView: () => {
        const newCount = get().statsViewCount + 1
        set({ statsViewCount: newCount })
        return newCount
      },
      getCurrentLevel: () => {
        const state = get()
        const currentLevel = LEVELS.find((l) => l.level === state.level) || LEVELS[0]
        const nextLevel = LEVELS.find((l) => l.level === state.level + 1)
        return {
          level: currentLevel.level,
          name: currentLevel.name,
          requiredXP: currentLevel.requiredXP,
          nextXP: nextLevel?.requiredXP,
        }
      },
      getXPProgress: () => {
        const state = get()
        const currentLevel = LEVELS.find((l) => l.level === state.level) || LEVELS[0]
        const nextLevel = LEVELS.find((l) => l.level === state.level + 1)
        if (!nextLevel) return { current: state.totalXP, required: currentLevel.requiredXP, percentage: 100 }
        const progress = state.totalXP - currentLevel.requiredXP
        const required = nextLevel.requiredXP - currentLevel.requiredXP
        return { current: state.totalXP, required: nextLevel.requiredXP, percentage: (progress / required) * 100 }
      },
    }),
    {
      name: `${STORAGE_PREFIX}:achievements`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
