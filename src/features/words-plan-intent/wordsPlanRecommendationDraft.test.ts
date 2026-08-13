import { describe, expect, it } from 'vitest'

import { createWordsPlanRecommendationPreview } from './wordsPlanRecommendationView'
import {
  clearWordsPlanRecommendationDraft,
  readWordsPlanRecommendationDraft,
  saveWordsPlanRecommendationDraft,
  WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY,
  WORDS_PLAN_RECOMMENDATION_DRAFT_TTL_MS,
} from './wordsPlanRecommendationDraft'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const generatedAt = '2026-08-13T03:00:00.000Z'
const now = new Date('2026-08-13T03:05:00.000Z')

function saveInput(overrides: Record<string, unknown> = {}) {
  const recommendation = createWordsPlanRecommendationPreview('2026-08-13')
  return {
    scopeKey: 'account:user-a',
    sourcePlanId: null,
    generatedAt,
    recommendation,
    form: {
      targetDate: '2026-08-13',
      planTitle: '8 月 13 日词汇计划',
      targetTime: '19:30',
      targetCount: recommendation.targetCount,
      targetDuration: recommendation.estimatedMinutes,
      studyMode: recommendation.studyMode,
      cloudMode: 'local' as const,
    },
    now,
    ...overrides,
  }
}

describe('words plan recommendation temporary drafts', () => {
  it('restores the generated recommendation and later learner edits', () => {
    const storage = new MemoryStorage()
    expect(saveWordsPlanRecommendationDraft({ ...saveInput(), storage })).toBe(true)

    const edited = saveInput({
      storage,
      now: new Date('2026-08-13T03:10:00.000Z'),
      form: {
        ...saveInput().form,
        planTitle: '我的晚间词汇计划',
        targetCount: 32,
        targetDuration: 28,
      },
    })
    expect(saveWordsPlanRecommendationDraft(edited)).toBe(true)

    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: null,
      storage,
      now: new Date('2026-08-13T03:11:00.000Z'),
    })).toMatchObject({
      generatedAt,
      form: {
        planTitle: '我的晚间词汇计划',
        targetCount: 32,
        targetDuration: 28,
      },
    })
  })

  it('isolates drafts by account and source plan', () => {
    const storage = new MemoryStorage()
    expect(saveWordsPlanRecommendationDraft({
      ...saveInput({ sourcePlanId: 'plan-1' }),
      storage,
    })).toBe(true)

    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-b',
      sourcePlanId: 'plan-1',
      storage,
      now,
    })).toBeNull()
    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: 'plan-2',
      storage,
      now,
    })).toBeNull()
    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: 'plan-1',
      storage,
      now,
    })?.recommendation.kind).toBe('words_plan_recommendation')
  })

  it('expires after 24 hours and removes malformed entries', () => {
    const storage = new MemoryStorage()
    expect(saveWordsPlanRecommendationDraft({ ...saveInput(), storage })).toBe(true)
    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: null,
      storage,
      now: new Date(Date.parse(generatedAt) + WORDS_PLAN_RECOMMENDATION_DRAFT_TTL_MS),
    })).toBeNull()
    expect(storage.getItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY)).toBeNull()

    storage.setItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY, '{bad-json')
    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: null,
      storage,
      now,
    })).toBeNull()
    expect(storage.getItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('clears only the sent plan draft', () => {
    const storage = new MemoryStorage()
    expect(saveWordsPlanRecommendationDraft({
      ...saveInput({ sourcePlanId: 'plan-1' }),
      storage,
    })).toBe(true)
    expect(saveWordsPlanRecommendationDraft({
      ...saveInput({ scopeKey: 'account:user-b', sourcePlanId: 'plan-2' }),
      storage,
    })).toBe(true)

    clearWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: 'plan-1',
      storage,
      now,
    })
    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-a',
      sourcePlanId: 'plan-1',
      storage,
      now,
    })).toBeNull()
    expect(readWordsPlanRecommendationDraft({
      scopeKey: 'account:user-b',
      sourcePlanId: 'plan-2',
      storage,
      now,
    })).not.toBeNull()
  })

  it('keeps the temporary store bounded to eight drafts', () => {
    const storage = new MemoryStorage()
    for (let index = 0; index < 10; index += 1) {
      expect(saveWordsPlanRecommendationDraft({
        ...saveInput({
          sourcePlanId: `plan-${index}`,
          now: new Date(Date.parse(generatedAt) + index * 1_000),
        }),
        storage,
      })).toBe(true)
    }
    const records = JSON.parse(storage.getItem(WORDS_PLAN_RECOMMENDATION_DRAFT_STORAGE_KEY)!)
    expect(records).toHaveLength(8)
    expect(records.map((record: { sourcePlanId: string }) => record.sourcePlanId)).toEqual([
      'plan-2', 'plan-3', 'plan-4', 'plan-5', 'plan-6', 'plan-7', 'plan-8', 'plan-9',
    ])
  })
})
