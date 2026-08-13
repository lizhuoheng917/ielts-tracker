import type { PlanCategory, StudyPlan } from '@/lib/types'

/**
 * Plan Center owns general IELTS routines. Vocabulary plans keep their legacy
 * category for sync and backup compatibility, but all new vocabulary-plan
 * creation and editing is routed through Vocabulary Center.
 */
export const PLAN_CENTER_CREATION_CATEGORIES = [
  'reading',
  'listening',
  'writing',
  'speaking',
  'general',
] as const satisfies readonly PlanCategory[]

const PLAN_CENTER_CREATION_CATEGORY_SET = new Set<PlanCategory>(PLAN_CENTER_CREATION_CATEGORIES)

export type PlanCenterCreationCategory = (typeof PLAN_CENTER_CREATION_CATEGORIES)[number]

export function isPlanCenterCreationCategory(value: unknown): value is PlanCenterCreationCategory {
  return typeof value === 'string'
    && PLAN_CENTER_CREATION_CATEGORY_SET.has(value as PlanCategory)
}

export function isVocabularyPlan(plan: Pick<StudyPlan, 'category'>): boolean {
  return plan.category === 'vocabulary'
}
