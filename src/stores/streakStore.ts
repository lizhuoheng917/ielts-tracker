import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StreakData } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_STREAK_DATA } from '@/lib/constants'
import { format } from 'date-fns'

interface StreakStore extends StreakData {
  recordActivity: (date?: string) => void
  checkAndUpdateStreak: () => { isNewDay: boolean; streakExtended: boolean }
}

export const useStreakStore = create<StreakStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STREAK_DATA,
      recordActivity: (date) => {
        const today = date || format(new Date(), 'yyyy-MM-dd')
        set((state) => {
          const newHeatmap = { ...state.heatmapData }
          newHeatmap[today] = (newHeatmap[today] || 0) + 1
          return { heatmapData: newHeatmap }
        })
      },
      checkAndUpdateStreak: () => {
        const today = format(new Date(), 'yyyy-MM-dd')
        const state = get()
        
        if (state.lastActiveDate === today) {
          return { isNewDay: false, streakExtended: false }
        }
        
        const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
        const isConsecutive = state.lastActiveDate === yesterday
        const newCurrentStreak = isConsecutive ? state.currentStreak + 1 : 1
        const newLongestStreak = Math.max(newCurrentStreak, state.longestStreak)
        
        set({
          currentStreak: newCurrentStreak,
          longestStreak: newLongestStreak,
          lastActiveDate: today,
        })
        
        return { isNewDay: true, streakExtended: isConsecutive }
      },
    }),
    {
      name: `${STORAGE_PREFIX}:streakData`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
