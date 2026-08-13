import { describe, expect, it } from 'vitest'

import type { StudyPlan } from '@/lib/types'

import {
  formatPlanSchedule,
  formatPlanTimeAndDuration,
  formatWeekDays,
  getPlanFrequency,
} from './Plans.presentation'

function createPlan(overrides: Record<string, unknown> = {}): StudyPlan {
  return {
    id: 'plan-1',
    title: '听力练习',
    category: 'listening',
    frequency: 'daily',
    isActive: true,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  } as StudyPlan
}

describe('Plans schedule presentation', () => {
  it('renders a one-time task with its specific date', () => {
    const plan = createPlan({ frequency: 'once', scheduledDate: '2026-08-08' })

    expect(getPlanFrequency(plan)).toBe('once')
    expect(formatPlanSchedule(plan)).toBe('8月8日')
  })

  it('renders a recurring weekly window without materializing future tasks', () => {
    const plan = createPlan({
      frequency: 'weekly',
      weekDays: [1, 3, 6],
      startDate: '2026-08-04',
      endDate: '2026-08-31',
    })

    expect(formatWeekDays(plan.weekDays)).toBe('周一、三、六')
    expect(formatPlanSchedule(plan)).toBe('周一、三、六 · 自 8月4日 起，至 8月31日')
  })

  it('keeps legacy custom plans visibly pending instead of treating them as daily', () => {
    const legacyPlan = createPlan({ frequency: 'custom' })

    expect(getPlanFrequency(legacyPlan)).toBe('custom')
    expect(formatPlanSchedule(legacyPlan)).toBe('旧版计划，待重新安排')
  })

  it('combines optional start time and duration in a compact label', () => {
    expect(formatPlanTimeAndDuration(createPlan({ targetTime: '19:30', targetDuration: 45 })))
      .toBe('19:30 · 约 45 分钟')
    expect(formatPlanTimeAndDuration(createPlan())).toBe('未设具体时间')
  })

  it('shows the vocabulary target count as a professional plan objective', () => {
    expect(formatPlanTimeAndDuration(createPlan({
      category: 'vocabulary', targetCount: 30, targetTime: '20:30', targetDuration: 25,
    }))).toBe('30 词 · 20:30 · 约 25 分钟')
  })
})
