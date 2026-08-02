import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  formatDailySuggestionAsMarkdown,
  type DailySuggestionV2,
} from '@/ai/structuredOutputs'
import { STORAGE_PREFIX } from '@/lib/constants'

export interface AiSuggestionMetadata {
  source: 'managed' | 'custom'
  dataAsOf: string
  rangeDays: number
  runId?: string
  warnings: string[]
}

export interface AiSuggestion {
  /** Legacy text stays available for backup export and pre-V2 saved suggestions. */
  content: string
  createdAt: string
  schemaVersion?: 2
  structuredContent?: DailySuggestionV2
  metadata?: AiSuggestionMetadata
}

interface AiSuggestionStore {
  suggestion: AiSuggestion | null
  setSuggestion: (content: DailySuggestionV2, metadata: AiSuggestionMetadata) => void
  clearSuggestion: () => void
}

export const useAiSuggestionStore = create<AiSuggestionStore>()(
  persist(
    (set) => ({
      suggestion: null,
      setSuggestion: (structuredContent, metadata) => set({
        suggestion: {
          content: formatDailySuggestionAsMarkdown(structuredContent),
          createdAt: new Date().toISOString(),
          schemaVersion: 2,
          structuredContent,
          metadata,
        },
      }),
      clearSuggestion: () => set({ suggestion: null }),
    }),
    {
      name: `${STORAGE_PREFIX}:aiSuggestion`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
