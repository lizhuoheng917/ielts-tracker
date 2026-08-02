import type { PlanExecution } from '@/lib/types'

const KEY_SEPARATOR = '\u0000'

export function planExecutionKey(
  execution: Pick<PlanExecution, 'planId' | 'date'>,
): string {
  return `${execution.planId}${KEY_SEPARATOR}${execution.date}`
}
export interface CanonicalPlanExecutionResult {
  executions: PlanExecution[]
  duplicates: PlanExecution[]
}

/**
 * Executions are stored newest-first. The first item for a semantic
 * `(planId,date)` key is therefore canonical, matching the existing UI rule.
 */
export function canonicalizePlanExecutions(
  executions: readonly PlanExecution[],
): CanonicalPlanExecutionResult {
  const seen = new Set<string>()
  const canonical: PlanExecution[] = []
  const duplicates: PlanExecution[] = []

  for (const execution of executions) {
    const key = planExecutionKey(execution)
    if (seen.has(key)) duplicates.push(execution)
    else {
      seen.add(key)
      canonical.push(execution)
    }
  }

  return { executions: canonical, duplicates }
}

export function findPlanExecutionForDate(
  executions: readonly PlanExecution[],
  planId: string,
  date: string,
): PlanExecution | undefined {
  return executions.find((execution) => (
    execution.planId === planId && execution.date === date
  ))
}

export function samePlanExecutionValue(
  left: PlanExecution,
  right: PlanExecution,
): boolean {
  return left.id === right.id
    && left.planId === right.planId
    && left.date === right.date
    && left.isCompleted === right.isCompleted
    && left.actualDuration === right.actualDuration
    && left.actualCount === right.actualCount
    && left.note === right.note
}
