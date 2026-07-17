import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'

interface AIStore {
  apiKey: string
  baseURL: string
  model: string
  setApiKey: (key: string) => void
  setBaseURL: (url: string) => void
  setModel: (model: string) => void
  clearConfig: () => void
}

const DEFAULT_BASE_URL = 'https://api.hub.agnes-ai.com/v1'
const DEFAULT_MODEL = 'agnes-2.5-flash'

export const useAIStore = create<AIStore>()(
  persist(
    (set) => ({
      apiKey: '',
      baseURL: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      setApiKey: (key) => set({ apiKey: key }),
      setBaseURL: (url) => set({ baseURL: url }),
      setModel: (model) => set({ model }),
      clearConfig: () => set({ apiKey: '', baseURL: DEFAULT_BASE_URL, model: DEFAULT_MODEL }),
    }),
    {
      name: `${STORAGE_PREFIX}ai-config`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
