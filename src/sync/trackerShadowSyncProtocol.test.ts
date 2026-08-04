import { describe, expect, it } from 'vitest'

import {
  assertShadowRemoteEntity,
  parseTrackerSyncCapabilities,
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

  it('rejects calendar-shaped values that are not real dates', () => {
    expect(() => assertShadowRemoteEntity({
      cursor: 1,
      entityKind: 'tracker_preferences',
      entityId: 'preferences',
      version: 1,
      payload: { examDate: '2026-99-99' },
      deletedAt: null,
      updatedAt: '2026-08-03T00:00:00.000Z',
    })).toThrow('local date or null')
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

  it('keeps optional selective-content availability closed until the server explicitly opens it', () => {
    const base = {
      product: 'tracker', schemaVersion: 1, protocolVersion: 1,
      enabled: true, accountEpoch: 1, currentCursor: 0,
      allowedEntityKinds: ['study_plan'], maxBatchSize: 10, maxPayloadBytes: 1024,
    }

    expect(parseTrackerSyncCapabilities(base)).toMatchObject({
      selectiveContentCloudV1: false,
      selectiveContentCloudEnabled: false,
      contentQuota: null,
    })
    expect(parseTrackerSyncCapabilities({
      ...base,
      selectiveContentCloudV1: true,
      selectiveContentCloudEnabled: true,
      contentQuota: {
        word_record: { limit: 3, used: 2, remaining: 1, legacyExemptCount: 7 },
      },
    })).toMatchObject({
      selectiveContentCloudV1: true,
      selectiveContentCloudEnabled: true,
      contentQuota: {
        word_record: { limit: 3, used: 2, remaining: 1, legacyExemptCount: 7 },
      },
    })
  })
})
