import { describe, expect, it, vi } from 'vitest'

import {
  formatManagedAiQuotaResetAt,
  loadManagedAiQuota,
  managedAiQuotaActionState,
  parseManagedAiQuota,
} from './managedAiQuota'

const resetAt = '2026-08-05T00:00:00.000Z'

describe('managed AI quota preview contract', () => {
  it('accepts only the requested enabled feature and its bounded own-account summary', () => {
    expect(parseManagedAiQuota({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'learning_analysis',
      enabled: true,
      dailyRequestLimit: 6,
      remainingRequests: 4,
      resetAt,
    }, 'learning_analysis')).toEqual({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'learning_analysis',
      enabled: true,
      dailyRequestLimit: 6,
      remainingRequests: 4,
      resetAt,
    })
  })

  it('keeps a disabled feature distinct from a quota of zero', () => {
    expect(parseManagedAiQuota({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'writing_feedback',
      enabled: false,
      dailyRequestLimit: null,
      remainingRequests: null,
      resetAt: null,
    }, 'writing_feedback')).toMatchObject({
      enabled: false,
      dailyRequestLimit: null,
      remainingRequests: null,
      resetAt: null,
    })
  })

  it('rejects mismatched features and impossible quota counts', () => {
    expect(() => parseManagedAiQuota({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'daily_suggestion',
      enabled: true,
      dailyRequestLimit: 2,
      remainingRequests: 3,
      resetAt,
    }, 'learning_analysis')).toThrow()

    expect(() => parseManagedAiQuota({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'daily_suggestion',
      enabled: true,
      dailyRequestLimit: 2,
      remainingRequests: 3,
      resetAt,
    }, 'daily_suggestion')).toThrow()
  })

  it('uses the requested purpose when loading and rejects malformed results', async () => {
    const invoke = vi.fn(async () => ({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'plan_draft',
      enabled: true,
      dailyRequestLimit: 4,
      remainingRequests: 1,
      resetAt,
    }))
    await expect(loadManagedAiQuota('plan_draft', invoke)).resolves.toMatchObject({
      remainingRequests: 1,
      resetAt,
    })
    expect(invoke).toHaveBeenCalledWith('plan_draft')

    await expect(loadManagedAiQuota('plan_draft', async () => ({
      schemaVersion: 1,
      productId: 'tracker',
      purpose: 'plan_draft',
      enabled: false,
      dailyRequestLimit: 4,
      remainingRequests: 0,
      resetAt,
    }))).rejects.toThrow()
  })

  it('formats only valid reset instants for the learner locale', () => {
    expect(formatManagedAiQuotaResetAt(resetAt)).toMatch(/\d{2}:\d{2}/)
    expect(formatManagedAiQuotaResetAt('not-a-time')).toBeNull()
  })

  it('blocks explicit generation while quota is unknown, disabled, or exhausted', () => {
    expect(managedAiQuotaActionState({ status: 'loading', quota: null })).toEqual({
      blocked: true,
      reason: 'loading',
    })
    expect(managedAiQuotaActionState({
      status: 'ready',
      quota: {
        schemaVersion: 1,
        productId: 'tracker',
        purpose: 'words_plan_recommendation',
        enabled: false,
        dailyRequestLimit: null,
        remainingRequests: null,
        resetAt: null,
      },
    })).toEqual({ blocked: true, reason: 'disabled' })
    expect(managedAiQuotaActionState({
      status: 'ready',
      quota: {
        schemaVersion: 1,
        productId: 'tracker',
        purpose: 'words_plan_recommendation',
        enabled: true,
        dailyRequestLimit: 4,
        remainingRequests: 0,
        resetAt,
      },
    })).toEqual({ blocked: true, reason: 'exhausted' })
  })

  it('keeps an unavailable preview and a positive balance non-blocking', () => {
    expect(managedAiQuotaActionState({ status: 'unavailable', quota: null })).toEqual({
      blocked: false,
      reason: null,
    })
    expect(managedAiQuotaActionState({
      status: 'ready',
      quota: {
        schemaVersion: 1,
        productId: 'tracker',
        purpose: 'words_plan_recommendation',
        enabled: true,
        dailyRequestLimit: 4,
        remainingRequests: 2,
        resetAt,
      },
    })).toEqual({ blocked: false, reason: null })
  })

  it('requires two remaining units only for an explicitly selected deep action', () => {
    const oneRemaining = {
      status: 'ready' as const,
      quota: {
        schemaVersion: 1 as const,
        productId: 'tracker' as const,
        purpose: 'writing_feedback' as const,
        enabled: true,
        dailyRequestLimit: 6,
        remainingRequests: 1,
        resetAt,
      },
    }
    expect(managedAiQuotaActionState(oneRemaining, 1)).toEqual({ blocked: false, reason: null })
    expect(managedAiQuotaActionState(oneRemaining, 2)).toEqual({ blocked: true, reason: 'exhausted' })
  })
})
