import { describe, expect, it, vi } from 'vitest'

import {
  formatManagedAiQuotaResetAt,
  loadManagedAiQuota,
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
})
