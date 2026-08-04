import { describe, expect, it } from 'vitest'

import {
  BrowserTrackerPhase4bSyncPersistence,
  createTrackerPhase4bSyncAccountState,
  parseTrackerPhase4bSyncAccountState,
  type TrackerPhase4bSyncKeyValueStore,
} from '@/sync/trackerPhase4bSyncPersistence'
import {
  mergeTrackerPhase4bRemoteEntityChanges,
  parseTrackerPhase4bRemoteEntity,
} from '@/sync/trackerPhase4bRecordSync'

const accountUserId = '10000000-0000-4000-8000-000000000001'
const deviceId = '20000000-0000-4000-8000-000000000002'
const operationId = '30000000-0000-4000-8000-000000000003'
const requestId = '40000000-0000-4000-8000-000000000004'
const now = '2026-08-03T00:00:00.000Z'

class MemoryKeyValueStore implements TrackerPhase4bSyncKeyValueStore {
  readonly values = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value)
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }
}

describe('Phase 4B IndexedDB persistence contract', () => {
  it('round-trips a sealed request atomically through the injected async store', async () => {
    const store = new MemoryKeyValueStore()
    const persistence = new BrowserTrackerPhase4bSyncPersistence(store)
    const state = createTrackerPhase4bSyncAccountState({
      accountUserId, deviceId, localDataEpoch: 'initial', now,
    })
    state.accountEpoch = 2
    state.nextLocalSequence = 2
    state.sealedBatch = {
      requestId,
      requestHash: 'a'.repeat(64),
      accountEpoch: 2,
      sealedAt: now,
      operations: [{
        operationId,
        entityKind: 'study_plan',
        entityId: 'plan-1',
        action: 'delete',
        localSequence: 1,
        baseVersion: 3,
        occurredAt: now,
      }],
    }

    await persistence.save(state)
    const restored = await persistence.load(accountUserId)

    expect(store.values.size).toBe(1)
    expect(restored?.sealedBatch).toEqual(state.sealedBatch)
  })

  it('rejects payloads on delete operations and non-UUID operation ids', () => {
    const state = createTrackerPhase4bSyncAccountState({
      accountUserId, deviceId, localDataEpoch: 'initial', now,
    })
    expect(() => parseTrackerPhase4bSyncAccountState({
      ...state,
      pendingOperations: [{
        operationId: 'not-a-uuid',
        entityKind: 'study_plan',
        entityId: 'plan-1',
        action: 'delete',
        localSequence: 1,
        baseVersion: 0,
        occurredAt: now,
        payload: {},
      }],
    }, accountUserId)).toThrow()
  })

  it('fails closed on malformed persisted JSON', async () => {
    const store = new MemoryKeyValueStore()
    store.values.set(accountUserId, '{bad-json')
    const persistence = new BrowserTrackerPhase4bSyncPersistence(store)

    await expect(persistence.load(accountUserId)).rejects.toThrow('malformed')
  })

  it('removes the current device outbox and baseline after permanent account deletion', async () => {
    const store = new MemoryKeyValueStore()
    const persistence = new BrowserTrackerPhase4bSyncPersistence(store)
    const state = createTrackerPhase4bSyncAccountState({
      accountUserId, deviceId, localDataEpoch: 'initial', now,
    })
    await persistence.save(state)

    await persistence.delete(accountUserId)

    expect(await persistence.load(accountUserId)).toBeNull()
    expect(store.values.has(accountUserId)).toBe(false)
  })

  it('round-trips an execution tombstone with its inherited plan/date semantic key', async () => {
    const store = new MemoryKeyValueStore()
    const persistence = new BrowserTrackerPhase4bSyncPersistence(store)
    const state = createTrackerPhase4bSyncAccountState({
      accountUserId, deviceId, localDataEpoch: 'initial', now,
    })
    const live = parseTrackerPhase4bRemoteEntity({
      entityKind: 'plan_execution',
      entityId: 'execution-random',
      version: 1,
      cursor: 1,
      payload: {
        planId: 'plan-1',
        date: '2026-08-03',
        isCompleted: true,
      },
      deletedAt: null,
      updatedAt: now,
    })
    const tombstone = parseTrackerPhase4bRemoteEntity({
      entityKind: 'plan_execution',
      entityId: 'execution-random',
      version: 2,
      cursor: 2,
      payload: null,
      deletedAt: now,
      updatedAt: now,
    })
    state.baselineEstablished = true
    state.baseline = mergeTrackerPhase4bRemoteEntityChanges({
      baseline: [live],
      changes: [tombstone],
      occurredAt: now,
    }).entities

    await persistence.save(state)
    const restored = await persistence.load(accountUserId)

    expect(restored?.baseline).toEqual([expect.objectContaining({
      entityId: 'execution-random',
      semanticKey: live.semanticKey,
      payload: null,
      deletedAt: now,
    })])
  })
})
