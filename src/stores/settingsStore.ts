import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Settings } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_SETTINGS } from '@/lib/constants'
import { toLocalDate } from '@/lib/localDate'
import { useAchievementStore } from '@/stores/achievementStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { useStreakStore } from '@/stores/streakStore'
import { appendActivityLedgerEventsOrThrow } from '@/data/activityLedgerRuntime'
import { createActivityTransactionPlan } from '@/data/activityTransaction'
import { createDailyCheckinMutation } from '@/data/dailyCheckin'
import {
  createEntityCollectionPatch,
  LOCAL_MUTATION_JOURNAL_KEY,
  runLocalMutation,
} from '@/data/localMutationJournal'
import {
  CANONICAL_MUTATION_EPOCH_KEY,
  CANONICAL_MUTATION_LEASE_KEY,
} from '@/data/canonicalMutationCoordinator'

interface CompleteCheckinOptions {
  recordActivity?: boolean
}

interface SettingsStore extends Settings {
  setExamDate: (date: string) => void
  clearExamDate: () => void
  setShowExamCountdown: (show: boolean) => void
  setShowAiSuggestions: (show: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleTheme: () => void
  checkIn: () => boolean // 返回是否打卡成功（false = 今天已打过卡）
  completeDailyCheckin: (date: string, options?: CompleteCheckinOptions) => boolean
  isCheckedInToday: () => boolean
  clearAllData: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setExamDate: (date) => set({ examDate: date }),
      clearExamDate: () => set((state) => ({ ...state, examDate: undefined })),
      setShowExamCountdown: (show) => set({ showExamCountdown: show }),
      setShowAiSuggestions: (show) => set({ showAiSuggestions: show }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      checkIn: () => {
        const today = toLocalDate()
        return get().completeDailyCheckin(today)
      },
      completeDailyCheckin: (date, options = {}) => {
        const dailyCheckins = useDailyCheckinStore.getState()
        if (dailyCheckins.hasAward(date)) {
          return false
        }

        const recordActivity = options.recordActivity !== false
        const occurredAt = new Date().toISOString()
        const streak = useStreakStore.getState()
        const checkin = createDailyCheckinMutation({
          date,
          occurredAt,
          streak,
          recordActivity,
          source: 'manual',
        })
        const achievements = useAchievementStore.getState()
        const plan = createActivityTransactionPlan({
          action: 'settings.checkin',
          domainPatches: [createEntityCollectionPatch({
            storage: localStorage,
            storageKey: `${STORAGE_PREFIX}:dailyCheckins`,
            collection: 'awards',
            changes: [{
              id: checkin.award.id,
              before: null,
              beforeIndex: dailyCheckins.awards.length,
              expectedAfter: checkin.award,
            }],
          })],
          events: [checkin.event],
          achievements,
          streak,
          lastCheckinDate: get().lastCheckinDate,
          createdAt: occurredAt,
        })
        const result = runLocalMutation(
          plan.transaction,
          () => {
            useDailyCheckinStore.setState({
              awards: [...dailyCheckins.awards, checkin.award]
                .sort((left, right) => left.date.localeCompare(right.date)),
            })
            useAchievementStore.setState(plan.projectionAfter.achievements)
            useStreakStore.setState(plan.projectionAfter.streak)
            set({ lastCheckinDate: plan.projectionAfter.lastCheckinDate })
          },
          () => {
            appendActivityLedgerEventsOrThrow(plan.ledgerEvents)
          },
        )
        if ((!result.ok || result.error) && typeof window !== 'undefined') {
          window.setTimeout(() => window.location.reload(), 0)
        }
        if (!result.ok) return false

        achievements.unlockBadge('first-checkin')
        if (plan.projectionAfter.streak.longestStreak >= 7) achievements.unlockBadge('streak-7')
        if (plan.projectionAfter.streak.longestStreak >= 30) achievements.unlockBadge('streak-30')

        return true
      },
      isCheckedInToday: () => {
        const today = toLocalDate()
        return get().lastCheckinDate === today
      },
      clearAllData: () => {
        const prefix = STORAGE_PREFIX
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (
            key?.startsWith(prefix)
            && key !== LOCAL_MUTATION_JOURNAL_KEY
            && key !== CANONICAL_MUTATION_LEASE_KEY
            && key !== CANONICAL_MUTATION_EPOCH_KEY
          ) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key))
      },
    }),
    {
      name: `${STORAGE_PREFIX}:settings`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
