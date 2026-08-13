import { describe, expect, it, vi } from 'vitest'

import {
  listWordsPlanReceipts,
  parseWordsPlanReceipts,
  type WordsPlanReceiptInvoker,
} from './wordsPlanReceipt'

const accepted = {
  contractVersion: 1,
  operationId: '20000000-0000-4000-8000-000000000001',
  sourceProduct: 'tracker',
  targetProduct: 'words',
  kind: 'plan_intent',
  status: 'accepted',
  targetDate: '2026-08-20',
  targetCount: 24,
  studyMode: 'mixed',
  sourceRef: 'plan-accepted',
  createdAt: '2026-08-13T08:00:00.000Z',
  expiresAt: '2026-08-20T08:00:00.000Z',
  resolvedAt: '2026-08-13T08:05:00.000Z',
}

const pending = {
  ...accepted,
  operationId: '20000000-0000-4000-8000-000000000002',
  status: 'pending',
  sourceRef: 'plan-pending',
  expiresAt: '2026-09-12T08:00:00.000Z',
  resolvedAt: undefined,
}

describe('Words plan receipts', () => {
  it('requests all visible plan references in one owner-scoped batch', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanReceiptInvoker>[0]) => [accepted, pending])
    const receipts = await listWordsPlanReceipts({
      userId: 'user-201',
      sourceRefs: ['plan-pending', 'plan-accepted', 'plan-pending'],
    }, invoke)

    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith({
      expectedUserId: 'user-201',
      sourceProduct: 'tracker',
      sourceRefs: ['plan-pending', 'plan-accepted'],
    })
    expect(receipts.get('plan-accepted')?.status).toBe('accepted')
    expect(receipts.get('plan-pending')?.status).toBe('pending')
  })

  it('does not call Supabase for an empty plan set', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanReceiptInvoker>[0]) => [])
    await expect(listWordsPlanReceipts({ userId: 'user-201', sourceRefs: [] }, invoke))
      .resolves.toEqual(new Map())
    expect(invoke).not.toHaveBeenCalled()
  })

  it('fails closed on foreign plans, duplicate rows and unexpected fields', () => {
    expect(() => parseWordsPlanReceipts([accepted], ['another-plan'])).toThrow('does not match')
    expect(() => parseWordsPlanReceipts([accepted, accepted], ['plan-accepted'])).toThrow('requested plan count')
    expect(() => parseWordsPlanReceipts([{ ...accepted, title: 'must not pass' }], ['plan-accepted']))
      .toThrow('does not match')
  })

  it('requires terminal timestamps and keeps pending receipts unresolved', () => {
    expect(() => parseWordsPlanReceipts([{ ...accepted, resolvedAt: undefined }], ['plan-accepted']))
      .toThrow('does not match')
    expect(() => parseWordsPlanReceipts([{ ...pending, resolvedAt: accepted.resolvedAt }], ['plan-pending']))
      .toThrow('does not match')
  })

  it('enforces the 50-plan batch and 256-byte reference limits before invoking', async () => {
    const invoke = vi.fn(async (_input: Parameters<WordsPlanReceiptInvoker>[0]) => [])
    await expect(listWordsPlanReceipts({
      userId: 'user-201',
      sourceRefs: Array.from({ length: 51 }, (_, index) => `plan-${index}`),
    }, invoke)).rejects.toThrow('batch limit')
    await expect(listWordsPlanReceipts({ userId: 'user-201', sourceRefs: ['词'.repeat(257)] }, invoke))
      .rejects.toThrow('too long')
    expect(invoke).not.toHaveBeenCalled()
  })
})
