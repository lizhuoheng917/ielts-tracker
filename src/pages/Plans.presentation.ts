import type { StudyPlan } from '@/lib/types'
import { isLocalDate } from '@/lib/localDate'

export type PlanPresentationFrequency = 'once' | 'daily' | 'weekly' | 'custom'

const WEEKDAY_LABELS: Record<number, string> = {
  0: '日',
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
}

export function getPlanFrequency(plan: StudyPlan): PlanPresentationFrequency {
  const { frequency } = plan
  return frequency === 'once' || frequency === 'daily' || frequency === 'weekly'
    ? frequency
    : 'custom'
}

export function getPlanScheduleFields(plan: StudyPlan) {
  return {
    scheduledDate: plan.scheduledDate,
    startDate: plan.startDate,
    endDate: plan.endDate,
  }
}

export function formatWeekDays(days?: readonly number[]): string {
  const labels = [...new Set(days ?? [])]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .map((day) => WEEKDAY_LABELS[day])

  return labels.length > 0 ? `周${labels.join('、')}` : '未设置星期'
}

export function formatShortDate(value?: string): string {
  if (!value || !isLocalDate(value)) return '待安排日期'
  const [, month, day] = value.split('-').map(Number)
  return `${month}月${day}日`
}

export function formatPlanSchedule(plan: StudyPlan): string {
  const frequency = getPlanFrequency(plan)
  const { scheduledDate, startDate, endDate } = getPlanScheduleFields(plan)

  if (frequency === 'once') return formatShortDate(scheduledDate)
  if (frequency === 'custom') return '旧版计划，待重新安排'

  const cadence = frequency === 'weekly'
    ? formatWeekDays(plan.weekDays)
    : '每天'
  const start = startDate ? `自 ${formatShortDate(startDate)} 起` : '立即开始'
  const end = endDate ? `，至 ${formatShortDate(endDate)}` : ''
  return `${cadence} · ${start}${end}`
}

export function formatPlanTimeAndDuration(plan: StudyPlan): string {
  const parts = [
    plan.targetCount
      ? plan.category === 'vocabulary' ? `${plan.targetCount} 词` : `目标 ${plan.targetCount}`
      : null,
    plan.targetTime,
    plan.targetDuration ? `约 ${plan.targetDuration} 分钟` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '未设具体时间'
}
