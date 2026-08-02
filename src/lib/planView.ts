import type { PlanCategory, PlanExecution, PlanFrequency, StudyPlan } from '@/lib/types'

export type PlanStatusFilter = 'all' | 'active' | 'paused'
export type PlanCategoryFilter = 'all' | PlanCategory
export type PlanFrequencyFilter = 'all' | PlanFrequency
export type PlanSortOrder = 'newest' | 'oldest' | 'title-asc' | 'time-asc'
export type EditablePlanFrequency = 'daily' | 'weekly'

export interface PlanFilters {
  searchQuery: string
  status: PlanStatusFilter
  category: PlanCategoryFilter
  frequency: PlanFrequencyFilter
  sortOrder: PlanSortOrder
}

export function toEditablePlanFrequency(
  frequency: PlanFrequency,
): EditablePlanFrequency {
  return frequency === 'weekly' ? 'weekly' : 'daily'
}

export function resolveWeeklyPlanDays(
  weekDays: readonly number[] | undefined,
  fallbackDay: number,
): number[] {
  const validDays = [...new Set(weekDays ?? [])].filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  )
  if (validDays.length > 0) return validDays

  const resolvedFallback =
    Number.isInteger(fallbackDay) && fallbackDay >= 0 && fallbackDay <= 6
      ? fallbackDay
      : 1
  return [resolvedFallback]
}

export function isPlanScheduledForDay(
  plan: Pick<StudyPlan, 'frequency' | 'isActive' | 'weekDays'>,
  dayOfWeek: number,
): boolean {
  if (!plan.isActive) return false
  if (plan.frequency === 'daily') return true
  if (plan.frequency !== 'weekly') return false
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) return false
  return plan.weekDays?.includes(dayOfWeek) ?? false
}

/**
 * Plan executions are persisted newest-first. Preserve the first match for each
 * plan so a legacy duplicate cannot let an older record overwrite today's state.
 */
export function indexLatestPlanExecutionsForDate(
  executions: readonly PlanExecution[],
  date: string,
): Map<string, PlanExecution> {
  const indexedExecutions = new Map<string, PlanExecution>()

  executions.forEach((execution) => {
    if (execution.date === date && !indexedExecutions.has(execution.planId)) {
      indexedExecutions.set(execution.planId, execution)
    }
  })

  return indexedExecutions
}

export function filterAndSortPlans(
  plans: readonly StudyPlan[],
  filters: PlanFilters,
): StudyPlan[] {
  const normalizedQuery = filters.searchQuery.trim().toLocaleLowerCase('zh-CN')

  return plans
    .filter((plan) => {
      const searchableText = [plan.title, plan.description]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery)
      const matchesStatus =
        filters.status === 'all' ||
        (filters.status === 'active' ? plan.isActive : !plan.isActive)
      const matchesCategory =
        filters.category === 'all' || plan.category === filters.category
      const matchesFrequency =
        filters.frequency === 'all' || plan.frequency === filters.frequency

      return matchesQuery && matchesStatus && matchesCategory && matchesFrequency
    })
    .sort((a, b) => {
      if (filters.sortOrder === 'oldest') {
        return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
      }
      if (filters.sortOrder === 'title-asc') {
        return (
          a.title.localeCompare(b.title, 'zh-CN') ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id)
        )
      }
      if (filters.sortOrder === 'time-asc') {
        return (
          (a.targetTime || '99:99').localeCompare(b.targetTime || '99:99') ||
          a.title.localeCompare(b.title, 'zh-CN') ||
          a.id.localeCompare(b.id)
        )
      }
      return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
    })
}
