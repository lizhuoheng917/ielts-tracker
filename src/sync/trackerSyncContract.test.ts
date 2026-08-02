import { describe, expect, it } from 'vitest'

import type { WordRecord } from '@/lib/types'
import {
  compactTrackerSyncOperations,
  createTrackerSyncDelete,
  createTrackerSyncPayload,
  createTrackerSyncUpsert,
  partitionTrackerSyncOperations,
  sealTrackerSyncBatch,
  TRACKER_SYNC_BATCH_LIMITS,
} from './trackerSyncContract'

const now = '2026-08-02T12:00:00.000Z'

function word(id: string, count = 20): WordRecord {
  return {
    id,
    date: '2026-08-02',
    category: 'academic',
    count,
    note: '复习同义替换',
    createdAt: now,
    updatedAt: now,
  }
}

describe('Tracker low-storage sync contract', () => {
  it('allowlists canonical fields and never copies derived or secret values', () => {
    const unsafeSource = {
      ...word('word-1'),
      totalXP: 900,
      heatmapData: { '2026-08-02': 1 },
      apiKey: 'must-not-leave-browser',
    }

    const payload = createTrackerSyncPayload('word_record', unsafeSource)

    expect(payload).toEqual({
      date: '2026-08-02',
      category: 'academic',
      count: 20,
      note: '复习同义替换',
      createdAt: now,
      updatedAt: now,
    })
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('totalXP')
    expect(payload).not.toHaveProperty('heatmapData')
    expect(payload).not.toHaveProperty('apiKey')
  })

  it('keeps theme, display switches and lastCheckinDate device-local', () => {
    const payload = createTrackerSyncPayload('tracker_preferences', {
      examDate: '2026-11-01',
      showExamCountdown: true,
      showAiSuggestions: false,
      theme: 'dark',
      lastCheckinDate: '2026-08-02',
    })

    expect(payload).toEqual({
      examDate: '2026-11-01',
    })
  })

  it('stores only one compact checkpoint for irreversible legacy progress', () => {
    const payload = createTrackerSyncPayload('account_checkpoint', {
      id: 'account',
      xpAdjustment: 25,
      longestStreakFloor: 12,
      unlockedBadges: ['stats-viewer', 'first-checkin', 'stats-viewer'],
      legacyActivityDeltasByMonth: {
        '2026-07': [[30, 1], [31, 2]],
      },
    })

    expect(payload).toEqual({
      xpAdjustment: 25,
      longestStreakFloor: 12,
      unlockedBadges: ['first-checkin', 'stats-viewer'],
      legacyActivityDeltasByMonth: {
        '2026-07': [[30, 1], [31, 2]],
      },
    })
    expect(payload).not.toHaveProperty('id')
  })

  it('rejects an out-of-order device sequence before compaction', () => {
    const later = createTrackerSyncDelete({
      operationId: 'op-later',
      entityKind: 'word_record',
      entityId: 'word-1',
      localSequence: 2,
      baseVersion: 1,
      occurredAt: now,
    })
    const earlier = createTrackerSyncDelete({
      operationId: 'op-earlier',
      entityKind: 'word_record',
      entityId: 'word-2',
      localSequence: 1,
      baseVersion: 1,
      occurredAt: now,
    })

    expect(() => compactTrackerSyncOperations([later, earlier])).toThrow(
      'ordered by localSequence',
    )
  })

  it('compacts repeated edits while preserving the earliest cloud base version', () => {
    const first = createTrackerSyncUpsert({
      operationId: 'op-1',
      entityKind: 'word_record',
      entityId: 'word-1',
      localSequence: 1,
      source: word('word-1', 20),
      baseVersion: 7,
      occurredAt: now,
    })
    const latest = createTrackerSyncUpsert({
      operationId: 'op-2',
      entityKind: 'word_record',
      entityId: 'word-1',
      localSequence: 2,
      source: word('word-1', 35),
      baseVersion: 8,
      occurredAt: '2026-08-02T12:01:00.000Z',
    })

    expect(compactTrackerSyncOperations([first, latest])).toEqual([{
      ...latest,
      baseVersion: 7,
    }])
  })

  it('keeps interleaved entity operations ordered after compaction', () => {
    const firstA = createTrackerSyncUpsert({
      operationId: 'op-a-1', entityKind: 'word_record', entityId: 'word-a',
      localSequence: 1, source: word('word-a', 10), baseVersion: 1, occurredAt: now,
    })
    const onlyB = createTrackerSyncUpsert({
      operationId: 'op-b-2', entityKind: 'word_record', entityId: 'word-b',
      localSequence: 2, source: word('word-b', 20), baseVersion: 1, occurredAt: now,
    })
    const latestA = createTrackerSyncUpsert({
      operationId: 'op-a-3', entityKind: 'word_record', entityId: 'word-a',
      localSequence: 3, source: word('word-a', 30), baseVersion: 2, occurredAt: now,
    })

    expect(compactTrackerSyncOperations([firstA, onlyB, latestA]).map(item => item.operationId))
      .toEqual(['op-b-2', 'op-a-3'])
  })

  it('drops a never-uploaded record that was created and deleted locally', () => {
    const create = createTrackerSyncUpsert({
      operationId: 'op-create',
      entityKind: 'word_record',
      entityId: 'word-new',
      localSequence: 1,
      source: word('word-new'),
      baseVersion: null,
      occurredAt: now,
    })
    const remove = createTrackerSyncDelete({
      operationId: 'op-delete',
      entityKind: 'word_record',
      entityId: 'word-new',
      localSequence: 2,
      baseVersion: null,
      occurredAt: '2026-08-02T12:01:00.000Z',
    })

    expect(compactTrackerSyncOperations([create, remove])).toEqual([])
  })

  it('requires explicit consent before restoring a deleted cloud entity', () => {
    const remove = createTrackerSyncDelete({
      operationId: 'op-delete',
      entityKind: 'word_record',
      entityId: 'word-1',
      localSequence: 1,
      baseVersion: 3,
      occurredAt: now,
    })
    const implicitRestore = createTrackerSyncUpsert({
      operationId: 'op-restore',
      entityKind: 'word_record',
      entityId: 'word-1',
      localSequence: 2,
      source: word('word-1'),
      baseVersion: 3,
      occurredAt: '2026-08-02T12:01:00.000Z',
    })

    expect(() => compactTrackerSyncOperations([remove, implicitRestore])).toThrow(
      'requires explicit consent',
    )
  })

  it('partitions compact operations by count and preserves order', () => {
    const operations = [0, 1, 2].map((index) => createTrackerSyncUpsert({
      operationId: `op-${index}`,
      entityKind: 'word_record',
      entityId: `word-${index}`,
      localSequence: index + 1,
      source: word(`word-${index}`),
      baseVersion: null,
      occurredAt: now,
    }))

    const batches = partitionTrackerSyncOperations(operations, {
      ...TRACKER_SYNC_BATCH_LIMITS,
      maxOperations: 2,
    })

    expect(batches.map((batch) => batch.map((operation) => operation.operationId))).toEqual([
      ['op-0', 'op-1'],
      ['op-2'],
    ])
  })

  it('seals a retry-stable batch without retaining mutable input references', () => {
    const operation = createTrackerSyncUpsert({
      operationId: 'op-1',
      entityKind: 'word_record',
      entityId: 'word-1',
      localSequence: 1,
      source: word('word-1'),
      baseVersion: null,
      occurredAt: now,
    })
    const batch = sealTrackerSyncBatch({
      batchId: 'batch-1',
      accountEpoch: 'account-epoch-1',
      deviceId: 'device-1',
      sealedAt: now,
      operations: [operation],
    })
    const serialized = JSON.stringify(batch)
    operation.payload.count = 999

    expect(JSON.stringify(batch)).toBe(serialized)
    expect(batch.operations[0]).toMatchObject({
      operationId: 'op-1',
      entityId: 'word-1',
    })
  })

  it('refuses to silently truncate an oversized diary entry', () => {
    expect(() => createTrackerSyncUpsert({
      operationId: 'op-diary',
      entityKind: 'diary_entry',
      entityId: 'diary-1',
      localSequence: 1,
      source: {
        id: 'diary-1',
        date: '2026-08-02',
        mood: 'good',
        content: 'x'.repeat(1024),
        createdAt: now,
        updatedAt: now,
      },
      baseVersion: null,
      occurredAt: now,
    }, { maxEntityBytes: 300 })).toThrow('per-entity byte limit')
  })
})
