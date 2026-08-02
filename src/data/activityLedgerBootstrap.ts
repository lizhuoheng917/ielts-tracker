import {
  createBackfillLedger,
  type ActivityEventSource,
  type ActivityLedgerSnapshot,
  type ActivityLedgerSourceSnapshot,
} from '@/data/activityLedger'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { useAchievementStore } from '@/stores/achievementStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { levelForXP } from '@/lib/learningXP'

export function getActivityLedgerSourceFromStores(): ActivityLedgerSourceSnapshot {
  const achievements = useAchievementStore.getState()
  const streak = useStreakStore.getState()

  return {
    achievements: {
      unlockedBadges: [...achievements.unlockedBadges],
      totalXP: achievements.totalXP,
      level: levelForXP(achievements.totalXP),
      statsViewCount: achievements.statsViewCount,
    },
    streak: {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActiveDate: streak.lastActiveDate || '',
      heatmapData: { ...streak.heatmapData },
    },
    lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
    rewardedCheckinDates: useDailyCheckinStore.getState().awards.map((award) => award.date),
  }
}

export function ensureActivityLedgerInitialized(
  capturedAt = new Date().toISOString(),
  source: ActivityEventSource = 'migration',
): boolean {
  const store = useActivityLedgerStore.getState()
  if (store.baseline !== null) return false

  const snapshot = createBackfillLedger(getActivityLedgerSourceFromStores(), capturedAt, source)
  return store.initialize(snapshot)
}

export function rebuildActivityLedger(
  capturedAt = new Date().toISOString(),
  source: ActivityEventSource = 'migration',
): ActivityLedgerSnapshot {
  const snapshot = createBackfillLedger(getActivityLedgerSourceFromStores(), capturedAt, source)
  useActivityLedgerStore.getState().replace(snapshot)
  return snapshot
}
