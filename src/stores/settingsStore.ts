import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Settings } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_SETTINGS } from '@/lib/constants'

interface SettingsStore extends Settings {
  setExamDate: (date: string) => void
  clearExamDate: () => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  exportAllData: () => string
  importAllData: (json: string) => boolean
  clearAllData: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      setExamDate: (date) => set({ examDate: date }),
      clearExamDate: () => set((state) => ({ ...state, examDate: undefined })),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      exportAllData: () => {
        const prefix = STORAGE_PREFIX
        const data: Record<string, unknown> = {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(prefix)) {
            const value = localStorage.getItem(key)
            if (value) {
              try {
                data[key] = JSON.parse(value)
              } catch {
                data[key] = value
              }
            }
          }
        }
        return JSON.stringify(data, null, 2)
      },
      importAllData: (json) => {
        try {
          const data = JSON.parse(json) as Record<string, unknown>
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, JSON.stringify(value))
          }
          return true
        } catch {
          return false
        }
      },
      clearAllData: () => {
        const prefix = STORAGE_PREFIX
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(prefix)) {
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
