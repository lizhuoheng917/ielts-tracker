import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { StudyPlan, PlanExecution } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'

interface PlanStore {
  plans: StudyPlan[]
  executions: PlanExecution[]
  addPlan: (plan: Omit<StudyPlan, 'id' | 'createdAt' | 'updatedAt'>) => void
  updatePlan: (id: string, data: Partial<Omit<StudyPlan, 'id' | 'createdAt'>>) => void
  deletePlan: (id: string) => void
  togglePlanActive: (id: string) => void
  addExecution: (execution: Omit<PlanExecution, 'id'>) => void
  updateExecution: (id: string, data: Partial<Omit<PlanExecution, 'id' | 'planId' | 'date'>>) => void
  deleteExecution: (id: string) => void
  getTodayExecutions: (date: string) => PlanExecution[]
  getActivePlans: () => StudyPlan[]
}

const generateId = () => crypto.randomUUID()

export const usePlanStore = create<PlanStore>()(
  persist(
    (set, get) => ({
      plans: [],
      executions: [],
      addPlan: (data) => {
        const now = new Date().toISOString()
        const plan: StudyPlan = { ...data, id: generateId(), createdAt: now, updatedAt: now }
        set((state) => ({ plans: [plan, ...state.plans] }))
      },
      updatePlan: (id, data) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p
          ),
        }))
      },
      deletePlan: (id) => {
        set((state) => ({
          plans: state.plans.filter((p) => p.id !== id),
          executions: state.executions.filter((e) => e.planId !== id),
        }))
      },
      togglePlanActive: (id) => {
        set((state) => ({
          plans: state.plans.map((p) =>
            p.id === id ? { ...p, isActive: !p.isActive, updatedAt: new Date().toISOString() } : p
          ),
        }))
      },
      addExecution: (data) => {
        const execution: PlanExecution = { ...data, id: generateId() }
        set((state) => ({ executions: [execution, ...state.executions] }))

        // 如果打卡标记为已完成，触发成就联动
        if (data.isCompleted) {
          import('@/lib/achievementService').then(({ handleCheckinCompleted }) => {
            handleCheckinCompleted()
          })
        }
      },
      updateExecution: (id, data) => {
        const oldExecution = get().executions.find((e) => e.id === id)
        const wasCompleted = oldExecution?.isCompleted ?? false

        set((state) => ({
          executions: state.executions.map((e) => (e.id === id ? { ...e, ...data } : e)),
        }))

        // 如果 isCompleted 从 false 变为 true，触发成就联动
        if (data.isCompleted === true && !wasCompleted) {
          import('@/lib/achievementService').then(({ handleCheckinCompleted }) => {
            handleCheckinCompleted()
          })
        }
      },
      deleteExecution: (id) => {
        set((state) => ({ executions: state.executions.filter((e) => e.id !== id) }))
      },
      getTodayExecutions: (date) => {
        return get().executions.filter((e) => e.date === date)
      },
      getActivePlans: () => {
        return get().plans.filter((p) => p.isActive)
      },
    }),
    {
      name: `${STORAGE_PREFIX}:studyPlans`,
      storage: createJSONStorage(() => localStorage),
    }
  )
)
