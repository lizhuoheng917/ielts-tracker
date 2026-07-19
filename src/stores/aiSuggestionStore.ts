import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'

export interface AiSuggestion {
  content: string
  createdAt: string
}

interface AiSuggestionStore {
  suggestion: AiSuggestion | null
  setSuggestion: (content: string) => void
  clearSuggestion: () => void
}

export const useAiSuggestionStore = create<AiSuggestionStore>()(
  persist(
    (set) => ({
      suggestion: null,
      setSuggestion: (content) => set({
        suggestion: {
          content,
          createdAt: new Date().toISOString(),
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
