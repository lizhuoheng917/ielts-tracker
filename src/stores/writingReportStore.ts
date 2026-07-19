import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'

export interface WritingReport {
  id: string
  essayType: 'task1' | 'task2'
  essayContent: string
  scores: {
    tr_ta: number
    cc: number
    lr: number
    gra: number
    total: number
  }
  feedback: string
  suggestions: string[]
  createdAt: string
}

interface WritingReportStore {
  reports: WritingReport[]
  addReport: (report: Omit<WritingReport, 'id' | 'createdAt'>) => void
  deleteReport: (id: string) => void
  getReportsByType: (type: 'task1' | 'task2') => WritingReport[]
}

const generateId = () => crypto.randomUUID()

export const useWritingReportStore = create<WritingReportStore>()(
  persist(
    (set, get) => ({
      reports: [],
      addReport: (data) => {
        const report: WritingReport = {
          ...data,
          id: generateId(),
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ reports: [report, ...state.reports] }))
      },
      deleteReport: (id) => {
        set((state) => ({
          reports: state.reports.filter((r) => r.id !== id),
        }))
      },
      getReportsByType: (type) => {
        return get().reports.filter((r) => r.essayType === type)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:writingReports`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
