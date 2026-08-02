import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AchievementState } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_ACHIEVEMENT_STATE, LEVELS, BADGES } from '@/lib/constants'
import { levelForXP } from '@/lib/learningXP'

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
          if (!Number.isFinite(amount) || amount === 0) return state
          const currentTotal = Number.isFinite(state.totalXP) ? Math.max(0, state.totalXP) : 0
          const newTotal = Math.max(0, currentTotal + amount)
          return { totalXP: newTotal, level: levelForXP(newTotal) }
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
        const derivedLevel = levelForXP(state.totalXP)
        const currentLevel = LEVELS.find((l) => l.level === derivedLevel) || LEVELS[0]
        const nextLevel = LEVELS.find((l) => l.level === derivedLevel + 1)
        return {
          level: currentLevel.level,
          name: currentLevel.name,
          requiredXP: currentLevel.requiredXP,
          nextXP: nextLevel?.requiredXP,
        }
      },
      getXPProgress: () => {
        const state = get()
        const safeTotalXP = Number.isFinite(state.totalXP) ? Math.max(0, state.totalXP) : 0
        const derivedLevel = levelForXP(safeTotalXP)
        const currentLevel = LEVELS.find((l) => l.level === derivedLevel) || LEVELS[0]
        const nextLevel = LEVELS.find((l) => l.level === derivedLevel + 1)
        if (!nextLevel) return { current: safeTotalXP, required: currentLevel.requiredXP, percentage: 100 }
        const progress = safeTotalXP - currentLevel.requiredXP
        const required = nextLevel.requiredXP - currentLevel.requiredXP
        return { current: safeTotalXP, required: nextLevel.requiredXP, percentage: (progress / required) * 100 }
      },
    }),
    {
      name: `${STORAGE_PREFIX}:achievements`,
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AchievementState>
        const totalXP = Number.isFinite(persisted.totalXP)
          ? Math.max(0, persisted.totalXP ?? 0)
          : 0
        return {
          ...currentState,
          ...persisted,
          totalXP,
          level: levelForXP(totalXP),
        }
      },
    }
  )
)
