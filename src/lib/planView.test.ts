import { describe, expect, it } from 'vitest'

import type { PlanExecution, StudyPlan } from '@/lib/types'
import { DEFAULT_DATA_PAGE_SIZE, getDataPageCount, paginateItems } from './dataView'
import {
  filterAndSortPlans,
  indexLatestPlanExecutionsForDate,
  isPlanScheduledForDate,
  isPlanScheduledForDay,
  resolveWeeklyPlanDays,
  toEditablePlanFrequency,
} from './planView'

function createPlan(overrides: Partial<StudyPlan> & Pick<StudyPlan, 'id'>): StudyPlan {
  return {
    title: '每日阅读',
    description: '完成一篇剑桥阅读',
    category: 'reading',
    frequency: 'daily',
    isActive: true,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('planView', () => {
  it('只把有效的每日或命中星期计划排入当天待办', () => {
    expect(isPlanScheduledForDay(createPlan({ id: 'daily' }), 5)).toBe(true)
    expect(isPlanScheduledForDay(createPlan({ id: 'weekly', frequency: 'weekly', weekDays: [1, 5] }), 5)).toBe(true)
    expect(isPlanScheduledForDay(createPlan({ id: 'other-day', frequency: 'weekly', weekDays: [1] }), 5)).toBe(false)
    expect(isPlanScheduledForDay(createPlan({ id: 'empty-week', frequency: 'weekly' }), 5)).toBe(false)
    expect(isPlanScheduledForDay(createPlan({ id: 'paused', isActive: false }), 5)).toBe(false)
    expect(isPlanScheduledForDay(createPlan({ id: 'legacy', frequency: 'custom' }), 5)).toBe(false)
  })

  it('按具体日期排入一次性任务，并尊重重复计划的起止边界', () => {
    expect(isPlanScheduledForDate(createPlan({
      id: 'once',
      frequency: 'once',
      scheduledDate: '2026-08-07',
    }), '2026-08-07')).toBe(true)
    expect(isPlanScheduledForDate(createPlan({
      id: 'once-other-day',
      frequency: 'once',
      scheduledDate: '2026-08-07',
    }), '2026-08-08')).toBe(false)
    expect(isPlanScheduledForDate(createPlan({
      id: 'malformed-once',
      frequency: 'once',
      scheduledDate: 'not-a-date',
    }), '2026-08-07')).toBe(false)
    expect(isPlanScheduledForDate(createPlan({
      id: 'bounded-daily',
      startDate: '2026-08-05',
      endDate: '2026-08-10',
    }), '2026-08-04')).toBe(false)
    expect(isPlanScheduledForDate(createPlan({
      id: 'bounded-daily-active',
      startDate: '2026-08-05',
      endDate: '2026-08-10',
    }), '2026-08-10')).toBe(true)
    expect(isPlanScheduledForDate(createPlan({
      id: 'bounded-weekly',
      frequency: 'weekly',
      weekDays: [5],
      startDate: '2026-08-05',
      endDate: '2026-08-10',
    }), '2026-08-07')).toBe(true)
    expect(isPlanScheduledForDate(createPlan({
      id: 'legacy-custom',
      frequency: 'custom',
    }), '2026-08-07')).toBe(false)
    expect(isPlanScheduledForDate(createPlan({
      id: 'invalid-range',
      startDate: '2026-08-11',
      endDate: '2026-08-10',
    }), '2026-08-10')).toBe(false)
  })

  it('同计划同日有重复记录时保留最新一条', () => {
    const executions: PlanExecution[] = [
      { id: 'newest', planId: 'daily', date: '2026-08-01', isCompleted: true },
      { id: 'other-day', planId: 'daily', date: '2026-07-31', isCompleted: false },
      { id: 'legacy-duplicate', planId: 'daily', date: '2026-08-01', isCompleted: false },
      { id: 'second-plan', planId: 'weekly', date: '2026-08-01', isCompleted: false },
    ]

    const indexed = indexLatestPlanExecutionsForDate(executions, '2026-08-01')

    expect(indexed.get('daily')?.id).toBe('newest')
    expect(indexed.get('daily')?.isCompleted).toBe(true)
    expect(indexed.get('weekly')?.id).toBe('second-plan')
    expect(indexed).toHaveLength(2)
  })

  it('保留可编辑的一次性计划，并将旧版自定义频率明确转换为每日频率', () => {
    expect(toEditablePlanFrequency('once')).toBe('once')
    expect(toEditablePlanFrequency('daily')).toBe('daily')
    expect(toEditablePlanFrequency('weekly')).toBe('weekly')
    expect(toEditablePlanFrequency('custom')).toBe('daily')
  })

  it('AI 每周计划缺少星期时使用当天作为安全兜底', () => {
    expect(resolveWeeklyPlanDays(undefined, 5)).toEqual([5])
    expect(resolveWeeklyPlanDays([], 0)).toEqual([0])
    expect(resolveWeeklyPlanDays([1, 3, 3, 9, -1], 5)).toEqual([1, 3])
    expect(resolveWeeklyPlanDays(undefined, 9)).toEqual([1])
  })

  it('按标题或描述搜索，并组合状态、分类和频率筛选', () => {
    const plans = [
      createPlan({ id: 'reading', title: '阅读精练', description: 'Cambridge 18' }),
      createPlan({ id: 'listening', title: '听力复盘', category: 'listening', description: 'Cambridge 18' }),
      createPlan({ id: 'paused', title: '暂停阅读', isActive: false, frequency: 'weekly' }),
    ]

    expect(
      filterAndSortPlans(plans, {
        searchQuery: 'CAMBRIDGE',
        status: 'active',
        category: 'reading',
        frequency: 'daily',
        sortOrder: 'newest',
      }).map((plan) => plan.id),
    ).toEqual(['reading'])
  })

  it('保留对历史自定义频率计划的筛选能力', () => {
    const plans = [
      createPlan({ id: 'daily' }),
      createPlan({ id: 'legacy', title: '旧版计划', frequency: 'custom' }),
    ]

    expect(
      filterAndSortPlans(plans, {
        searchQuery: '',
        status: 'all',
        category: 'all',
        frequency: 'custom',
        sortOrder: 'newest',
      }).map((plan) => plan.id),
    ).toEqual(['legacy'])
  })

  it('支持全部排序方式且不修改原数组', () => {
    const plans = [
      createPlan({ id: 'a', title: '乙计划', targetTime: '20:00', createdAt: '2026-08-01T08:00:00.000Z' }),
      createPlan({ id: 'b', title: '甲计划', targetTime: '08:00', createdAt: '2026-08-03T08:00:00.000Z' }),
      createPlan({ id: 'c', title: '丙计划', createdAt: '2026-08-02T08:00:00.000Z' }),
    ]
    const sourceOrder = plans.map((plan) => plan.id)
    const filters = {
      searchQuery: '',
      status: 'all' as const,
      category: 'all' as const,
      frequency: 'all' as const,
    }

    expect(filterAndSortPlans(plans, { ...filters, sortOrder: 'newest' }).map((plan) => plan.id)).toEqual(['b', 'c', 'a'])
    expect(filterAndSortPlans(plans, { ...filters, sortOrder: 'oldest' }).map((plan) => plan.id)).toEqual(['a', 'c', 'b'])
    expect(filterAndSortPlans(plans, { ...filters, sortOrder: 'title-asc' }).map((plan) => plan.id)).toEqual(['c', 'b', 'a'])
    expect(filterAndSortPlans(plans, { ...filters, sortOrder: 'time-asc' }).map((plan) => plan.id)).toEqual(['b', 'a', 'c'])
    expect(plans.map((plan) => plan.id)).toEqual(sourceOrder)
  })

  it('将 5000 条数据限制为每页最多 50 条', () => {
    const plans = Array.from({ length: 5_000 }, (_, index) =>
      createPlan({ id: `plan-${index}`, title: `计划 ${index}` }),
    )

    expect(DEFAULT_DATA_PAGE_SIZE).toBe(50)
    expect(getDataPageCount(plans.length)).toBe(100)
    expect(paginateItems(plans, 1)).toHaveLength(50)
    expect(paginateItems(plans, 100)).toHaveLength(50)
    expect(paginateItems(plans, 100)[0]?.id).toBe('plan-4950')
  })
})
