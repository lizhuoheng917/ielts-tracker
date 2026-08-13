import type { StudyPlan } from '@/lib/types'

export const WORDS_HUB_SOURCE_PLAN_PARAM = 'sourcePlan'
export const WORDS_HUB_NEW_PLAN_ID = '__new_vocabulary_plan__'

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function listWordsHubVocabularyPlans(
  plans: readonly StudyPlan[],
): StudyPlan[] {
  return plans
    .filter((plan) => plan.category === 'vocabulary')
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
      const updatedDifference = timestamp(right.updatedAt) - timestamp(left.updatedAt)
      if (updatedDifference !== 0) return updatedDifference
      return left.title.localeCompare(right.title, 'zh-CN')
    })
}

export function resolveWordsHubVocabularyPlan(
  plans: readonly StudyPlan[],
  preferredPlanId?: string | null,
): StudyPlan | null {
  const vocabularyPlans = listWordsHubVocabularyPlans(plans)
  if (preferredPlanId === WORDS_HUB_NEW_PLAN_ID) return null
  if (preferredPlanId) {
    return vocabularyPlans.find((plan) => plan.id === preferredPlanId) ?? null
  }
  return vocabularyPlans[0] ?? null
}

export function createWordsHubHref(planId: string): string {
  const params = new URLSearchParams({ [WORDS_HUB_SOURCE_PLAN_PARAM]: planId })
  return `/words?${params.toString()}`
}
