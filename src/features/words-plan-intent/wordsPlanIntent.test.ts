import { describe, expect, it, vi } from 'vitest'

import {
  createWordsPlanIntent,
  parseWordsPlanIntentHandoff,
  type WordsPlanIntentInvoker,
} from './wordsPlanIntent'

const operationId = '00000000-0000-4000-8000-000000000301'
const now = new Date(2026, 7, 12, 9, 0, 0)
const response = {
  contractVersion: 1,
  operationId,
  sourceProduct: 'tracker',
  targetProduct: 'words',
  kind: 'plan_intent',
  status: 'pending',
  targetDate: '2026-08-12',
  targetCount: 24,
  studyMode: 'mixed',
  sourceRef: 'plan-301',
  createdAt: '2026-08-12T08:00:00.000Z',
  expiresAt: '2026-09-11T08:00:00.000Z',
}

describe('Tracker to Words plan intent', () => {
  it('sends only the compact reviewed fields and validates the response', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanIntentInvoker>[0]) => response)
    await expect(createWordsPlanIntent({
      userId: 'user-301', operationId, targetDate: '2026-08-12', targetCount: 24,
      studyMode: 'mixed', sourceRef: 'plan-301', now,
    }, invoke)).resolves.toMatchObject(response)
    expect(invoke).toHaveBeenCalledWith({
      expectedUserId: 'user-301', operationId,
      request: {
        sourceProduct: 'tracker', targetProduct: 'words', kind: 'plan_intent',
        targetDate: '2026-08-12', targetCount: 24, studyMode: 'mixed', sourceRef: 'plan-301',
      },
    })
    expect(JSON.stringify(invoke.mock.calls[0]?.[0])).not.toContain('title')
    expect(JSON.stringify(invoke.mock.calls[0]?.[0])).not.toContain('description')
  })

  it('rejects invalid requests before invoking the backend', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanIntentInvoker>[0]) => response)
    await expect(createWordsPlanIntent({
      userId: 'user-301', operationId, targetDate: '2026-02-30', targetCount: 0, studyMode: 'mixed',
      now,
    }, invoke)).rejects.toThrow('request is invalid')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('fails closed when the server returns another operation or mutated target', () => {
    const expected = { operationId, targetDate: '2026-08-12', targetCount: 24, studyMode: 'mixed' as const, sourceRef: 'plan-301' }
    expect(() => parseWordsPlanIntentHandoff({ ...response, targetCount: 25 }, expected)).toThrow('does not match')
    expect(() => parseWordsPlanIntentHandoff({ ...response, status: 'accepted' }, expected)).toThrow('does not match')
    expect(() => parseWordsPlanIntentHandoff({ ...response, contentText: 'must not pass' }, expected)).toThrow('does not match')
  })

  it('rejects dates outside the short-lived 29-day handoff window', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanIntentInvoker>[0]) => response)
    await expect(createWordsPlanIntent({
      userId: 'user-301', operationId, targetDate: '2026-09-11', targetCount: 24,
      studyMode: 'mixed', sourceRef: 'plan-301', now,
    }, invoke)).rejects.toThrow('request is invalid')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('keeps the same operation id for an identical retry', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanIntentInvoker>[0]) => response)
    const input = { userId: 'user-301', operationId, targetDate: '2026-08-12', targetCount: 24, studyMode: 'mixed' as const, sourceRef: 'plan-301', now }
    await createWordsPlanIntent(input, invoke)
    await createWordsPlanIntent(input, invoke)
    expect(invoke.mock.calls.map(([call]) => call.operationId)).toEqual([operationId, operationId])
  })
})
