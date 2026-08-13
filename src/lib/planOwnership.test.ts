import { describe, expect, it } from 'vitest'

import {
  isPlanCenterCreationCategory,
  isVocabularyPlan,
  PLAN_CENTER_CREATION_CATEGORIES,
} from './planOwnership'

describe('vocabulary plan ownership', () => {
  it('keeps vocabulary out of Plan Center creation without removing the legacy category', () => {
    expect(PLAN_CENTER_CREATION_CATEGORIES).toEqual([
      'reading',
      'listening',
      'writing',
      'speaking',
      'general',
    ])
    expect(isPlanCenterCreationCategory('vocabulary')).toBe(false)
    expect(isPlanCenterCreationCategory('reading')).toBe(true)
  })

  it('recognizes historical vocabulary plans for routing and display', () => {
    expect(isVocabularyPlan({ category: 'vocabulary' })).toBe(true)
    expect(isVocabularyPlan({ category: 'general' })).toBe(false)
  })
})
