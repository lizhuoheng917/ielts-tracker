import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { STORAGE_PREFIX } from '@/lib/constants'
import type { DailyCheckinAward } from '@/lib/types'

interface DailyCheckinStore {
  migrationVersion: number
  awards: DailyCheckinAward[]
  hasAward: (date: string) => boolean
}

export const useDailyCheckinStore = create<DailyCheckinStore>()(
  persist(
    (_set, get) => ({
      migrationVersion: 0,
      awards: [],
      hasAward: (date) => get().awards.some((award) => award.date === date),
    }),
    {
      name: `${STORAGE_PREFIX}:dailyCheckins`,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        migrationVersion: state.migrationVersion,
        awards: state.awards,
      }),
    },
  ),
)
