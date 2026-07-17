import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'

export interface AnalysisReport {
  id: string
  title: string
  content: string // markdown 格式的 AI 分析内容
  createdAt: string
}

interface ReportStore {
  reports: AnalysisReport[]
  addReport: (report: Omit<AnalysisReport, 'id'>) => string
  deleteReport: (id: string) => void
}

const generateId = () => crypto.randomUUID()

export const useReportStore = create<ReportStore>()(
  persist(
    (set) => ({
      reports: [],
      addReport: (data) => {
        const id = generateId()
        const report: AnalysisReport = { ...data, id }
        set((state) => ({ reports: [report, ...state.reports] }))
        return id
      },
      deleteReport: (id) => {
        set((state) => ({ reports: state.reports.filter((r) => r.id !== id) }))
      },
    }),
    {
      name: `${STORAGE_PREFIX}:reports`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
