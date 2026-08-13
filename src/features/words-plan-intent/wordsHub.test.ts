import { describe, expect, it } from 'vitest'

import type { StudyPlan } from '@/lib/types'
import {
  createWordsHubHref,
  listWordsHubVocabularyPlans,
  resolveWordsHubVocabularyPlan,
  WORDS_HUB_NEW_PLAN_ID,
} from './wordsHub'

function plan(
  id: string,
  overrides: Partial<StudyPlan> = {},
): StudyPlan {
  return {
    id,
    title: id,
    category: 'vocabulary',
    frequency: 'daily',
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('Words vocabulary hub routing', () => {
  it('keeps only vocabulary plans and prioritizes active recent plans', () => {
    const plans = [
      plan('paused-newer', { isActive: false, updatedAt: '2026-08-13T00:00:00.000Z' }),
      plan('reading', { category: 'reading' }),
      plan('active-older', { updatedAt: '2026-08-10T00:00:00.000Z' }),
      plan('active-newer', { updatedAt: '2026-08-12T00:00:00.000Z' }),
    ]

    expect(listWordsHubVocabularyPlans(plans).map((candidate) => candidate.id)).toEqual([
      'active-newer',
      'active-older',
      'paused-newer',
    ])
  })

  it('uses the requested vocabulary plan without falling back to an unrelated plan id', () => {
    const plans = [plan('first'), plan('requested', { updatedAt: '2026-07-01T00:00:00.000Z' })]

    expect(resolveWordsHubVocabularyPlan(plans, 'requested')?.id).toBe('requested')
    expect(resolveWordsHubVocabularyPlan(plans, 'missing')).toBeNull()
    expect(resolveWordsHubVocabularyPlan(plans)?.id).toBe('first')
    expect(resolveWordsHubVocabularyPlan([], 'missing')).toBeNull()
  })

  it('keeps an explicit new-plan choice instead of silently selecting an existing plan', () => {
    expect(resolveWordsHubVocabularyPlan([plan('existing')], WORDS_HUB_NEW_PLAN_ID)).toBeNull()
  })

  it('creates an encoded contextual route to the vocabulary hub', () => {
    expect(createWordsHubHref('plan / 词汇')).toBe('/words?sourcePlan=plan+%2F+%E8%AF%8D%E6%B1%87')
  })
})
