import { describe, expect, it } from 'vitest'

import type { StudyPlan } from '@/lib/types'
import {
  canonicalVocabularyPlanMatches,
  createCanonicalVocabularyPlanFields,
  defaultVocabularyPlanDuration,
  defaultVocabularyPlanTitle,
} from './vocabularyPlanTemplate'

describe('Vocabulary Center professional plan template', () => {
  it('maps the reviewed form to one compact Tracker plan without AI prose', () => {
    expect(createCanonicalVocabularyPlanFields({
      title: '  雅思核心词汇  ',
      targetDate: '2026-08-14',
      targetTime: '20:30',
      targetCount: 30,
      targetDuration: 25,
    })).toEqual({
      title: '雅思核心词汇',
      description: '目标由词汇中心维护；具体词书与单词在 Words 中确认。',
      category: 'vocabulary',
      frequency: 'once',
      scheduledDate: '2026-08-14',
      targetTime: '20:30',
      targetDuration: 25,
      targetCount: 30,
      isActive: true,
    })
  })

  it('provides short deterministic defaults for manual plans', () => {
    expect(defaultVocabularyPlanTitle('2026-08-14')).toBe('8月14日词汇计划')
    expect(defaultVocabularyPlanDuration(30)).toBe(24)
    expect(defaultVocabularyPlanDuration(1)).toBe(5)
    expect(defaultVocabularyPlanDuration(1_000)).toBe(180)
  })

  it('detects whether an existing plan already equals the canonical template', () => {
    const fields = createCanonicalVocabularyPlanFields({
      title: '今晚词汇复习',
      targetDate: '2026-08-14',
      targetCount: 24,
      targetDuration: 20,
    })
    const plan: StudyPlan = {
      ...fields,
      id: 'plan-1',
      createdAt: '2026-08-13T00:00:00.000Z',
      updatedAt: '2026-08-13T00:00:00.000Z',
    }

    expect(canonicalVocabularyPlanMatches(plan, fields)).toBe(true)
    expect(canonicalVocabularyPlanMatches({ ...plan, targetCount: 25 }, fields)).toBe(false)
  })

  it('preserves an explicitly selected recurring plan schedule while updating its targets', () => {
    const existing: StudyPlan = {
      id: 'weekly-plan',
      title: '每周词汇',
      description: '保留我原来写的计划说明。',
      category: 'vocabulary',
      frequency: 'weekly',
      startDate: '2026-08-01',
      endDate: '2026-09-01',
      weekDays: [1, 4],
      targetCount: 20,
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }

    expect(createCanonicalVocabularyPlanFields({
      title: existing.title,
      targetDate: '2026-08-14',
      targetCount: 30,
      targetDuration: 25,
    }, existing)).toMatchObject({
      frequency: 'weekly',
      startDate: '2026-08-01',
      endDate: '2026-09-01',
      weekDays: [1, 4],
      targetCount: 30,
      description: '保留我原来写的计划说明。',
    })
  })

  it('rejects invalid date, count, duration and time before plan storage', () => {
    expect(() => createCanonicalVocabularyPlanFields({
      title: '', targetDate: '2026-02-30', targetCount: 20,
      targetDuration: 20, targetTime: '25:00',
    })).toThrow('template is invalid')
  })
})
