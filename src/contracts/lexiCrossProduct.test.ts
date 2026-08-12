import { describe, expect, it } from 'vitest'

import {
  LEXI_CROSS_PRODUCT_CONTRACT_VERSION,
  LEXI_CROSS_PRODUCT_LIMITS,
  type LexiContentCandidateRequestV1,
  type LexiPlanIntentRequestV1,
  type LexiWordsDailySummaryV1,
} from './lexiCrossProduct'

describe('Lexi cross-product V1 contract', () => {
  it('keeps the persistent handoff envelope compact and bounded', () => {
    expect(LEXI_CROSS_PRODUCT_CONTRACT_VERSION).toBe(1)
    expect(LEXI_CROSS_PRODUCT_LIMITS).toEqual({
      requestBytes: 4096,
      contentTextBytes: 1024,
      meaningTextBytes: 2048,
      referenceBytes: 256,
      pendingPerAccount: 50,
      totalPerAccount: 100,
      pendingRetentionDays: 30,
      resolvedRetentionDays: 7,
    })
  })

  it('keeps summaries read-only in shape and separates plan from content fields', () => {
    const summary: LexiWordsDailySummaryV1 = {
      contractVersion: 1,
      product: 'words',
      coverage: 'cloud_data_only',
      studyDate: '2026-08-12',
      attempts: 8,
      passed: 6,
      durationMs: 90_000,
      activeWordbooks: 1,
      activeWords: 40,
      newWords: 12,
      learningWords: 8,
      masteredWords: 20,
      dueWords: 4,
    }
    const plan: LexiPlanIntentRequestV1 = {
      sourceProduct: 'tracker',
      targetProduct: 'words',
      kind: 'plan_intent',
      targetDate: '2026-08-12',
      targetCount: 20,
      studyMode: 'new',
    }
    const candidate: LexiContentCandidateRequestV1 = {
      sourceProduct: 'tracker',
      targetProduct: 'words',
      kind: 'content_candidate',
      contentKind: 'phrase',
      contentText: 'take practical steps',
    }

    expect(summary.coverage).toBe('cloud_data_only')
    expect(plan.kind).toBe('plan_intent')
    expect(candidate.kind).toBe('content_candidate')
  })
})
