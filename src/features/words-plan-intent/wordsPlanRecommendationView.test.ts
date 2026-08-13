import { describe, expect, it } from 'vitest'

import { parseWordsPlanRecommendationV2 } from '@/ai/structuredOutputs'
import {
  createWordsPlanRecommendationPreview,
  parseWordsPlanRecommendationTaskContext,
  resolveWordsPlanningTimeZone,
  wordsPlanAnalysisFallbackMessage,
  wordsPlanFormFingerprint,
  wordsPlanRecommendationTaskNamespace,
} from './wordsPlanRecommendationView'

describe('Words plan recommendation presentation helpers', () => {
  it('creates a valid preview that remains a recommendation rather than a mutation', () => {
    const value = createWordsPlanRecommendationPreview('2026-08-13')
    expect(parseWordsPlanRecommendationV2(value)).toEqual(value)
    expect(value.reviewWords + value.newWords).toBe(value.targetCount)
    expect(JSON.stringify(value)).not.toMatch(/wordTexts|meaning|wordbookId/)
  })

  it('accepts only compact, non-private in-memory task context', () => {
    const value = {
      sourcePlanId: 'plan-1',
      targetDate: '2026-08-13',
      snapshotContextHash: 'words-plan-ctx-0a1b2c3d',
      wordsGeneratedAt: '2026-08-13T02:00:00.000Z',
    }
    expect(parseWordsPlanRecommendationTaskContext(value)).toEqual(value)
    expect(parseWordsPlanRecommendationTaskContext({ ...value, sourcePlanId: null })).toEqual({
      ...value,
      sourcePlanId: null,
    })
    expect(parseWordsPlanRecommendationTaskContext({ ...value, planTitle: 'private title' })).toBeNull()
    expect(parseWordsPlanRecommendationTaskContext({ ...value, targetDate: '13/08/2026' })).toBeNull()
  })

  it('uses the browser IANA time zone and safely falls back to UTC', () => {
    expect(resolveWordsPlanningTimeZone(() => 'Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(resolveWordsPlanningTimeZone(() => '')).toBe('UTC')
    expect(resolveWordsPlanningTimeZone(() => { throw new Error('blocked') })).toBe('UTC')
  })

  it('keeps task and adoption identity deterministic without storing recommendation text', () => {
    expect(wordsPlanRecommendationTaskNamespace('plan-701')).toBe('plans-to-words:plan-701')
    expect(wordsPlanFormFingerprint('2026-08-13', 30, 'mixed')).toBe(
      '{"targetDate":"2026-08-13","targetCount":30,"studyMode":"mixed"}',
    )
    expect(wordsPlanAnalysisFallbackMessage()).toMatch(/手动填写并发送/)
  })
})
