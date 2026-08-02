import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StreakData } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_STREAK_DATA } from '@/lib/constants'
import { toLocalDate } from '@/lib/localDate'
import {
  applyActivityDelta,
  calculateStreakEndingOn,
  deriveStreakData,
} from '@/lib/streakProjection'
import { useAchievementStore } from '@/stores/achievementStore'

function unlockLearningStreakMilestones(currentStreak: number) {
  const achievements = useAchievementStore.getState()
  if (currentStreak >= 7) achievements.unlockBadge('streak-7')
  if (currentStreak >= 30) achievements.unlockBadge('streak-30')
}

interface StreakStore extends StreakData {
  recordActivity: (date?: string) => { isNewDay: boolean; streakExtended: boolean }
  removeActivity: (date: string) => void
  moveActivity: (previousDate: string, nextDate: string) => void
  /** 从 heatmapData 重算连续天数（用于历史数据修正） */
  recomputeStreak: () => void
}

export const useStreakStore = create<StreakStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STREAK_DATA,
      recordActivity: (date) => {
        const activityDate = date || toLocalDate()
        const state = get()
        const isNewDay = (state.heatmapData[activityDate] ?? 0) <= 0
        const newHeatmap = applyActivityDelta(state.heatmapData, activityDate, 1)
        const projection = deriveStreakData(newHeatmap, toLocalDate())
        const streakExtended = isNewDay && calculateStreakEndingOn(newHeatmap, activityDate) > 1

        set({
          ...projection,
          longestStreak: Math.max(state.longestStreak, projection.longestStreak),
        })
        unlockLearningStreakMilestones(projection.currentStreak)

        return { isNewDay, streakExtended }
      },
      removeActivity: (date) => {
        const state = get()
        if ((state.heatmapData[date] ?? 0) <= 0) return
        const newHeatmap = applyActivityDelta(state.heatmapData, date, -1)
        const projection = deriveStreakData(newHeatmap, toLocalDate())
        set({
          ...projection,
          longestStreak: Math.max(state.longestStreak, projection.longestStreak),
        })
      },
      moveActivity: (previousDate, nextDate) => {
        if (previousDate === nextDate) return
        const state = get()
        const withoutPrevious = applyActivityDelta(state.heatmapData, previousDate, -1)
        const newHeatmap = applyActivityDelta(withoutPrevious, nextDate, 1)
        const projection = deriveStreakData(newHeatmap, toLocalDate())
        set({
          ...projection,
          longestStreak: Math.max(state.longestStreak, projection.longestStreak),
        })
      },
      recomputeStreak: () => {
        const state = get()
        const projection = deriveStreakData(state.heatmapData, toLocalDate())
        set({
          ...projection,
          longestStreak: Math.max(state.longestStreak, projection.longestStreak),
        })
      },
    }),
    {
      name: `${STORAGE_PREFIX}:streakData`,
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<StreakData>
        const projection = deriveStreakData(
          persisted.heatmapData ?? currentState.heatmapData,
          toLocalDate(),
        )
        return {
          ...currentState,
          ...persisted,
          ...projection,
          longestStreak: Math.max(persisted.longestStreak ?? 0, projection.longestStreak),
        }
      },
    }
  )
)
