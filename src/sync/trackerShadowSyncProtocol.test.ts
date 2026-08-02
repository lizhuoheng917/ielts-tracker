import { describe, expect, it } from 'vitest'

import {
  assertShadowRemoteEntity,
  parseTrackerShadowSyncOperation,
  stableTrackerSyncJson,
  trackerSyncSha256,
} from '@/sync/trackerShadowSyncProtocol'

describe('Tracker shadow sync wire protocol', () => {
  it('creates one stable hash regardless of object key insertion order', async () => {
    const left = [{ operationId: 'op-1', payload: { examDate: '2026-12-01' } }]
    const right = [{ payload: { examDate: '2026-12-01' }, operationId: 'op-1' }]

    expect(stableTrackerSyncJson(left)).toBe(stableTrackerSyncJson(right))
    expect(await trackerSyncSha256(left)).toBe(await trackerSyncSha256(right))
  })

  it('rejects every pull entity outside the examDate pilot', () => {
    expect(() => assertShadowRemoteEntity({
      cursor: 1,
      entityKind: 'word_record',
      entityId: 'word-1',
      version: 1,
      payload: { count: 10 },
      deletedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    })).toThrow('outside the exam-date pilot')
  })

  it('rejects additional preference fields instead of installing them', () => {
    expect(() => assertShadowRemoteEntity({
      cursor: 1,
      entityKind: 'tracker_preferences',
      entityId: 'preferences',
      version: 1,
      payload: { examDate: '2026-12-01', theme: 'dark' },
      deletedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    })).toThrow('unsupported fields')
  })

  it('rejects a tampered durable operation before it can reach an RPC', () => {
    expect(() => parseTrackerShadowSyncOperation({
      operationId: 'op-1',
      entityKind: 'tracker_preferences',
      entityId: 'preferences',
      action: 'upsert',
      localSequence: 1,
      baseVersion: 0,
      occurredAt: '2026-08-03T00:00:00.000Z',
      payload: { examDate: '2026-12-01', apiKey: 'must-not-upload' },
    })).toThrow('unsupported fields')
  })
})
