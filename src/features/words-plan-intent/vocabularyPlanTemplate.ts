import { isLocalDate } from '@/lib/localDate'
import type { PlanFrequency, StudyPlan } from '@/lib/types'

const TITLE_MAX_LENGTH = 60
const TARGET_COUNT_MAX = 1_000
const TARGET_DURATION_MIN = 5
const TARGET_DURATION_MAX = 180
const TARGET_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const DESCRIPTION_MAX_BYTES = 4 * 1024

const DEFAULT_DESCRIPTION = '目标由词汇中心维护；具体词书与单词在 Words 中确认。'

export type VocabularyPlanTemplateInput = {
  title: string
  targetDate: string
  targetTime?: string
  targetCount: number
  targetDuration: number
}

export type CanonicalVocabularyPlanFields = {
  title: string
  description: string
  category: 'vocabulary'
  frequency: Exclude<PlanFrequency, 'custom'>
  scheduledDate?: string
  startDate?: string
  endDate?: string
  weekDays?: number[]
  targetTime?: string
  targetDuration: number
  targetCount: number
  isActive: boolean
}

export function defaultVocabularyPlanTitle(targetDate: string): string {
  if (!isLocalDate(targetDate)) return '词汇学习计划'
  const [, month, day] = targetDate.split('-').map(Number)
  return `${month}月${day}日词汇计划`
}

export function defaultVocabularyPlanDuration(targetCount: number): number {
  const safeCount = Number.isFinite(targetCount) ? Math.max(1, Math.round(targetCount)) : 20
  return Math.min(TARGET_DURATION_MAX, Math.max(TARGET_DURATION_MIN, Math.round(safeCount * 0.8)))
}

function normalizedTitle(title: string, targetDate: string): string {
  const normalized = title.trim().replace(/\s+/g, ' ')
  return (normalized || defaultVocabularyPlanTitle(targetDate)).slice(0, TITLE_MAX_LENGTH)
}

function normalizedDescription(existingPlan?: StudyPlan | null): string {
  const existing = existingPlan?.category === 'vocabulary'
    ? existingPlan.description?.trim()
    : undefined
  return existing && new TextEncoder().encode(existing).byteLength <= DESCRIPTION_MAX_BYTES
    ? existing
    : DEFAULT_DESCRIPTION
}

function normalizedRecurringSchedule(plan: StudyPlan) {
  const startDate = isLocalDate(plan.startDate) ? plan.startDate : undefined
  const candidateEndDate = isLocalDate(plan.endDate) ? plan.endDate : undefined
  const endDate = candidateEndDate && (!startDate || candidateEndDate >= startDate)
    ? candidateEndDate
    : undefined
  const weekDays = plan.frequency === 'weekly'
    ? [...new Set(plan.weekDays ?? [])]
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        .sort((left, right) => left - right)
    : []

  return {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(weekDays.length > 0 ? { weekDays } : {}),
  }
}

export function createCanonicalVocabularyPlanFields(
  input: VocabularyPlanTemplateInput,
  existingPlan?: StudyPlan | null,
): CanonicalVocabularyPlanFields {
  if (
    !isLocalDate(input.targetDate)
    || !Number.isSafeInteger(input.targetCount)
    || input.targetCount < 1
    || input.targetCount > TARGET_COUNT_MAX
    || !Number.isSafeInteger(input.targetDuration)
    || input.targetDuration < TARGET_DURATION_MIN
    || input.targetDuration > TARGET_DURATION_MAX
    || (input.targetTime !== undefined && input.targetTime !== '' && !TARGET_TIME_PATTERN.test(input.targetTime))
  ) {
    throw new Error('Vocabulary plan template is invalid')
  }

  const recurringPlan = existingPlan?.category === 'vocabulary'
    && (existingPlan.frequency === 'daily' || existingPlan.frequency === 'weekly')
    ? existingPlan
    : null
  const frequency: CanonicalVocabularyPlanFields['frequency'] = recurringPlan?.frequency === 'weekly'
    ? 'weekly'
    : recurringPlan?.frequency === 'daily'
      ? 'daily'
      : 'once'

  return {
    title: normalizedTitle(input.title, input.targetDate),
    description: normalizedDescription(existingPlan),
    category: 'vocabulary',
    frequency,
    ...(recurringPlan
      ? normalizedRecurringSchedule(recurringPlan)
      : { scheduledDate: input.targetDate }),
    ...(input.targetTime ? { targetTime: input.targetTime } : {}),
    targetDuration: input.targetDuration,
    targetCount: input.targetCount,
    isActive: true,
  }
}

export function canonicalVocabularyPlanMatches(
  plan: StudyPlan,
  fields: CanonicalVocabularyPlanFields,
): boolean {
  return plan.title === fields.title
    && plan.description === fields.description
    && plan.category === fields.category
    && plan.frequency === fields.frequency
    && plan.scheduledDate === fields.scheduledDate
    && plan.startDate === fields.startDate
    && plan.endDate === fields.endDate
    && JSON.stringify(plan.weekDays) === JSON.stringify(fields.weekDays)
    && plan.targetTime === fields.targetTime
    && plan.targetDuration === fields.targetDuration
    && plan.targetCount === fields.targetCount
    && plan.isActive === fields.isActive
}
