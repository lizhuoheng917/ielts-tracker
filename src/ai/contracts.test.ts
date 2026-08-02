import { describe, expect, it, vi } from 'vitest'
import { AI_CAPABILITIES, resolveAiScopes } from './capabilities'
import { executeConfirmedAiCommand } from './commands'
import type { AiCommandDraft, AiCommandReceipt, AiContextSnapshotV1 } from './contracts'
import {
  AiContractValidationError,
  assertFreshAiSnapshot,
  parseAiCommandAction,
  parseAiDataScope,
  parseAiPurpose,
} from './validation'

function createDraft(status: 'pending' | 'confirmed' | 'rejected' = 'confirmed'): AiCommandDraft {
  return {
    schemaVersion: 1,
    draftId: 'draft-1',
    runId: 'run-1',
    action: 'plan.create',
    targetScope: 'plans',
    payload: { title: '听力训练' },
    idempotencyKey: 'plan-draft-1',
    context: {
      snapshotId: 'snapshot-1',
      contextHash: 'context-1',
      sourceRevision: 'source-1',
      routeMode: 'managed',
      accountScopeId: 'managed:user-1',
      generatedAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-08-02T00:00:00.000Z',
    },
    confirmation: { required: true, status },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

function createSnapshot(createdAt = '2026-08-01T00:00:00.000Z'): AiContextSnapshotV1 {
  return {
    schemaVersion: 1,
    snapshotId: 'snapshot-1',
    purpose: 'learning_analysis',
    createdAt,
    dataAsOf: createdAt,
    freshness: { status: 'fresh', ageSeconds: 0, maxAgeSeconds: 300 },
    sourceRevision: 'revision-1',
    contextHash: 'context-1',
    scopes: ['learning.summary'],
    privateScopes: [],
    quality: { status: 'limited', recordCount: 1, warnings: [] },
    data: {},
  }
}

describe('AI contracts', () => {
  it('rejects unknown purposes, scopes and command actions', () => {
    expect(() => parseAiPurpose('delete_everything')).toThrow(AiContractValidationError)
    expect(() => parseAiDataScope('api.credentials')).toThrow(AiContractValidationError)
    expect(() => parseAiCommandAction('plan.delete')).toThrow(AiContractValidationError)
  })

  it('keeps private content off until it is both requested and granted', () => {
    expect(resolveAiScopes('learning_analysis')).toEqual({
      scopes: ['learning.summary', 'learning.timeline', 'practice.summary', 'plans.summary'],
      privateScopes: [],
    })

    expect(
      resolveAiScopes(
        'learning_analysis',
        ['diary.excerpts', 'ai_artifacts.history'],
        ['diary.excerpts'],
      ),
    ).toMatchObject({ privateScopes: ['diary.excerpts'] })
  })

  it('never grants direct mutation to a model capability', () => {
    expect(Object.values(AI_CAPABILITIES).every((capability) => !capability.directMutationAllowed)).toBe(true)
  })

  it('rejects a snapshot after its freshness window', () => {
    expect(() => assertFreshAiSnapshot(
      createSnapshot(),
      new Date('2026-08-01T00:05:01.000Z'),
    )).toThrowError(expect.objectContaining({ code: 'STALE_SNAPSHOT' }))
  })

  it('requires confirmation and emits an idempotent duplicate receipt', () => {
    const apply = vi.fn(() => 'plan-1')
    const pending = executeConfirmedAiCommand(createDraft('pending'), {
      existingReceipts: [],
      apply,
      createId: () => 'receipt-pending',
      now: new Date('2026-08-01T00:00:01.000Z'),
    })
    expect(pending.receipt.status).toBe('rejected')
    expect(apply).not.toHaveBeenCalled()

    const applied = executeConfirmedAiCommand(createDraft(), {
      existingReceipts: [],
      apply,
      createId: () => 'receipt-applied',
      now: new Date('2026-08-01T00:00:02.000Z'),
    })
    expect(applied).toMatchObject({ applied: true, receipt: { status: 'applied', targetId: 'plan-1' } })

    const duplicate = executeConfirmedAiCommand(createDraft(), {
      existingReceipts: [applied.receipt as AiCommandReceipt],
      apply,
      createId: () => 'receipt-duplicate',
      now: new Date('2026-08-01T00:00:03.000Z'),
    })
    expect(duplicate).toMatchObject({ applied: false, receipt: { status: 'duplicate', targetId: 'plan-1' } })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('uses the deterministic domain target when an earlier receipt was not persisted', () => {
    const apply = vi.fn(() => 'plan-1')
    const result = executeConfirmedAiCommand(createDraft(), {
      existingReceipts: [],
      findExistingTarget: () => 'draft-1',
      apply,
      createId: () => 'receipt-recovered',
      now: new Date('2026-08-01T00:00:04.000Z'),
    })

    expect(result).toMatchObject({
      applied: false,
      receipt: { status: 'duplicate', targetId: 'draft-1' },
    })
    expect(apply).not.toHaveBeenCalled()
  })
})
