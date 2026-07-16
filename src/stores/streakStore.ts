import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StreakData } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_STREAK_DATA } from '@/lib/constants'
import { format, subDays } from 'date-fns'

interface StreakStore extends StreakData {
  recordActivity: (date?: string) => { isNewDay: boolean; streakExtended: boolean }
  /** 从 heatmapData 重算连续天数（用于历史数据修正） */
  recomputeStreak: () => void
}

/**
 * 从 heatmapData 中重算从今天往回的连续天数
 * 遍历 heatmapData 中从今天开始往前逐天检查，连续有记录的天数即为 currentStreak
 */
function recalcCurrentStreak(heatmapData: Record<string, number>): number {
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const date = format(subDays(today, i), 'yyyy-MM-dd')
    if (heatmapData[date] && heatmapData[date] > 0) {
      streak++
    } else {
      break
    }
  }
  return streak
}

export const useStreakStore = create<StreakStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STREAK_DATA,
      recordActivity: (date) => {
        const today = date || format(new Date(), 'yyyy-MM-dd')
        const state = get()
        const isNewDay = state.lastActiveDate !== today

        const newHeatmap = { ...state.heatmapData }
        newHeatmap[today] = (newHeatmap[today] || 0) + 1

        // 检查是否延续了连续打卡（昨天有活动记录）
        const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
        const streakExtended = isNewDay && !!(newHeatmap[yesterday] && newHeatmap[yesterday] > 0)

        // 从 heatmapData 重算连续天数（基于所有学习活动，不限于打卡）
        const newCurrentStreak = recalcCurrentStreak(newHeatmap)
        const newLongestStreak = Math.max(newCurrentStreak, state.longestStreak)

        set({
          heatmapData: newHeatmap,
          currentStreak: newCurrentStreak,
          longestStreak: newLongestStreak,
          lastActiveDate: today,
        })

        return { isNewDay, streakExtended }
      },
      recomputeStreak: () => {
        const state = get()
        const newCurrentStreak = recalcCurrentStreak(state.heatmapData)
        const newLongestStreak = Math.max(newCurrentStreak, state.longestStreak)
        if (newCurrentStreak !== state.currentStreak || newLongestStreak !== state.longestStreak) {
          set({
            currentStreak: newCurrentStreak,
            longestStreak: newLongestStreak,
          })
        }
      },
    }),
    {
      name: `${STORAGE_PREFIX}:streakData`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
