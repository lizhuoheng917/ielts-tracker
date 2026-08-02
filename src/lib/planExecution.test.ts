import { describe, expect, it } from 'vitest'

import type { PlanExecution } from '@/lib/types'
import {
  canonicalizePlanExecutions,
  findPlanExecutionForDate,
  planExecutionKey,
  samePlanExecutionValue,
} from './planExecution'

const executions: PlanExecution[] = [
  { id: 'newest', planId: 'plan-1', date: '2026-08-02', isCompleted: false },
  { id: 'other-plan', planId: 'plan-2', date: '2026-08-02', isCompleted: true },
  { id: 'legacy-duplicate', planId: 'plan-1', date: '2026-08-02', isCompleted: true },
  { id: 'other-day', planId: 'plan-1', date: '2026-08-01', isCompleted: true },
]

describe('plan execution semantic key', () => {
  it('uses plan and local date as the unique semantic key', () => {
    expect(planExecutionKey(executions[0])).toBe(planExecutionKey(executions[2]))
    expect(planExecutionKey(executions[0])).not.toBe(planExecutionKey(executions[1]))
    expect(planExecutionKey(executions[0])).not.toBe(planExecutionKey(executions[3]))
  })

  it('keeps the first persisted item and reports later legacy duplicates', () => {
    const result = canonicalizePlanExecutions(executions)

    expect(result.executions.map((execution) => execution.id)).toEqual([
      'newest',
      'other-plan',
      'other-day',
    ])
    expect(result.duplicates.map((execution) => execution.id)).toEqual(['legacy-duplicate'])
    expect(executions.map((execution) => execution.id)).toEqual([
      'newest',
      'other-plan',
      'legacy-duplicate',
      'other-day',
    ])
  })

  it('finds the canonical first match and compares every persisted field', () => {
    const found = findPlanExecutionForDate(executions, 'plan-1', '2026-08-02')
    expect(found?.id).toBe('newest')
    expect(samePlanExecutionValue(found!, { ...found! })).toBe(true)
    expect(samePlanExecutionValue(found!, { ...found!, note: 'changed' })).toBe(false)
  })
})
