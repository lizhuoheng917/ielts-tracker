import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'

export type AIContextRangeDays = 7 | 30 | 90

export interface AIPrivacyPreferences {
  defaultRangeDays: AIContextRangeDays
  includeDiaryExcerpts: boolean
  includePriorAIArtifacts: boolean
}

interface AIPrivacyStore extends AIPrivacyPreferences {
  setDefaultRangeDays: (days: AIContextRangeDays) => void
  setIncludeDiaryExcerpts: (include: boolean) => void
  setIncludePriorAIArtifacts: (include: boolean) => void
  resetPrivacyPreferences: () => void
}

export const DEFAULT_AI_PRIVACY_PREFERENCES: AIPrivacyPreferences = {
  defaultRangeDays: 30,
  includeDiaryExcerpts: false,
  includePriorAIArtifacts: false,
}

/**
 * Per-device consent for data that may be sent to an AI provider. These
 * preferences intentionally stay outside portable backups: a restored device
 * must opt in again before private free-form content can leave that browser.
 */
export const useAIPrivacyStore = create<AIPrivacyStore>()(
  persist(
    (set) => ({
      ...DEFAULT_AI_PRIVACY_PREFERENCES,
      setDefaultRangeDays: (defaultRangeDays) => set({ defaultRangeDays }),
      setIncludeDiaryExcerpts: (includeDiaryExcerpts) => set({ includeDiaryExcerpts }),
      setIncludePriorAIArtifacts: (includePriorAIArtifacts) => set({ includePriorAIArtifacts }),
      resetPrivacyPreferences: () => set(DEFAULT_AI_PRIVACY_PREFERENCES),
    }),
    {
      name: `${STORAGE_PREFIX}:aiPrivacy`,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        defaultRangeDays: state.defaultRangeDays,
        includeDiaryExcerpts: state.includeDiaryExcerpts,
        includePriorAIArtifacts: state.includePriorAIArtifacts,
      }),
    },
  ),
)
