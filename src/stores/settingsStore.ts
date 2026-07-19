import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Settings } from '@/lib/types'
import { STORAGE_PREFIX, DEFAULT_SETTINGS } from '@/lib/constants'

interface SettingsStore extends Settings {
  setExamDate: (date: string) => void
  clearExamDate: () => void
  setShowExamCountdown: (show: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleTheme: () => void
  checkIn: () => boolean // 返回是否打卡成功（false = 今天已打过卡）
  isCheckedInToday: () => boolean
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
      setShowExamCountdown: (show) => set({ showExamCountdown: show }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      checkIn: () => {
        const today = new Date().toISOString().split('T')[0]
        if (get().lastCheckinDate === today) return false
        set({ lastCheckinDate: today })

        // 调用成就系统的打卡联动（包含热力图、XP、首次打卡徽章、连续打卡徽章）
        import('@/lib/achievementService').then(({ handleCheckinCompleted }) => {
          handleCheckinCompleted()
        })

        return true
      },
      isCheckedInToday: () => {
        const today = new Date().toISOString().split('T')[0]
        return get().lastCheckinDate === today
      },
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
