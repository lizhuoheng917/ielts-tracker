import { describe, expect, it, vi } from 'vitest'

import {
  createTrackerShadowSyncAccountState,
  type TrackerShadowSyncAccountState,
  type TrackerShadowSyncPersistence,
} from '@/sync/trackerShadowSyncPersistence'
import { TrackerShadowSyncRuntime } from '@/sync/trackerShadowSyncRuntime'
import type { TrackerShadowSyncRpc } from '@/sync/trackerShadowSyncRpc'
import type { TrackerShadowSyncOperation } from '@/sync/trackerShadowSyncProtocol'

const accountA = '00000000-0000-4000-8000-000000000001'
const now = '2026-08-03T00:00:00.000Z'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

class MemoryPersistence implements TrackerShadowSyncPersistence {
  states = new Map<string, TrackerShadowSyncAccountState>()

  async load(accountUserId: string) {
    const state = this.states.get(accountUserId)
    return state ? clone(state) : null
  }

  async save(state: TrackerShadowSyncAccountState) {
    this.states.set(state.accountUserId, clone(state))
  }
}

function capabilities(enabled = true) {
  return {
    product: 'tracker',
    schemaVersion: 1,
    protocolVersion: 1,
    enabled,
    accountEpoch: 1,
    currentCursor: 0,
    allowedEntityKinds: ['tracker_preferences'],
    maxBatchSize: 50,
    maxPayloadBytes: 65_536,
  }
}

function successfulRpc(options: {
  accountUserId?: string
  apply?: TrackerShadowSyncRpc['applyBatch']
  enabled?: boolean
  remoteExamDate?: string | null
} = {}): TrackerShadowSyncRpc {
  return {
    getVerifiedIdentity: vi.fn(async () => ({
      accountUserId: options.accountUserId ?? accountA,
      accessToken: 'verified-account-token',
    })),
    getCapabilities: vi.fn(async () => capabilities(options.enabled ?? true)),
    applyBatch: options.apply ?? vi.fn(async (_token, input) => ({
      status: 'applied',
      requestId: input.requestId,
      requestHash: input.requestHash,
      accountEpoch: 1,
      cursor: 1,
      results: input.operations.map((operation: TrackerShadowSyncOperation) => ({
        operationId: operation.operationId,
        entityKind: operation.entityKind,
        entityId: operation.entityId,
        status: 'applied',
        version: 1,
        cursor: 1,
        reason: null,
      })),
    })),
    pull: vi.fn(async () => ({
      enabled: true,
      accountEpoch: 1,
      cursor: 0,
      nextCursor: 1,
      hasMore: false,
      changes: [{
        cursor: 1,
        entityKind: 'tracker_preferences',
        entityId: 'preferences',
        version: 1,
        payload: { examDate: options.remoteExamDate ?? '2026-12-01' },
        deletedAt: null,
        updatedAt: now,
      }],
    })),
    getSnapshot: vi.fn(async () => ({
      enabled: true,
      accountEpoch: 1,
      cursor: 1,
      generatedAt: now,
      snapshotHash: 'server-snapshot-hash',
      entities: [{
        cursor: 1,
        entityKind: 'tracker_preferences',
        entityId: 'preferences',
        version: 1,
        payload: { examDate: options.remoteExamDate ?? '2026-12-01' },
        deletedAt: null,
        updatedAt: now,
      }],
    })),
  }
}

function runtime(input: {
  persistence: TrackerShadowSyncPersistence
  rpc: TrackerShadowSyncRpc
  lock?: <T>(task: () => Promise<T>) => Promise<T>
  ids?: string[]
}) {
  const ids = input.ids ?? ['device-1', 'operation-1', 'request-1']
  return new TrackerShadowSyncRuntime({
    accountUserId: accountA,
    persistence: input.persistence,
    rpc: input.rpc,
    inspectBinding: () => ({ status: 'bound' }),
    readLocalDataEpoch: () => 'local-epoch-1',
    withMutationLock: input.lock ?? (async <T>(task: () => Promise<T>) => task()),
    now: () => new Date(now),
    createId: () => ids.shift() ?? 'extra-id',
  })
}

describe('Tracker examDate shadow sync runtime', () => {
  it('does not enqueue or upload until the server capability is enabled', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ enabled: false })

    await runtime({ persistence, rpc }).flush('2026-12-01')

    expect(persistence.states.size).toBe(0)
    expect(rpc.applyBatch).not.toHaveBeenCalled()
  })

  it('requires a verified matching account before touching the account queue', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({
      accountUserId: '00000000-0000-4000-8000-000000000002',
    })

    await runtime({ persistence, rpc }).flush('2026-12-01')

    expect(persistence.states.size).toBe(0)
    expect(rpc.getCapabilities).not.toHaveBeenCalled()
    expect(rpc.applyBatch).not.toHaveBeenCalled()
  })

  it('uploads only examDate and validates pull/snapshot without installing remote state', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExamDate: '2027-01-15' })
    const localSettings = { examDate: '2026-12-01' }
    let lockEntries = 0

    await runtime({
      persistence,
      rpc,
      lock: async <T>(task: () => Promise<T>) => {
        lockEntries += 1
        return task()
      },
    }).flush(localSettings.examDate)

    expect(rpc.applyBatch).toHaveBeenCalledWith('verified-account-token', expect.objectContaining({
      deviceId: 'device-1',
      operations: [expect.objectContaining({
        operationId: 'operation-1',
        localSequence: 1,
        payload: { examDate: '2026-12-01' },
      })],
    }))
    expect(rpc.pull).toHaveBeenCalledTimes(1)
    expect(rpc.getSnapshot).toHaveBeenCalledTimes(1)
    expect(lockEntries).toBe(1)
    expect(localSettings.examDate).toBe('2026-12-01')
    expect(persistence.states.get(accountA)).toMatchObject({
      sealedBatch: null,
      cursor: 1,
      remoteVersion: 1,
      lastValidation: {
        requestId: 'request-1',
        snapshotHash: 'server-snapshot-hash',
      },
    })
  })

  it('retries a lost response with the exact same request, operation and hash', async () => {
    const persistence = new MemoryPersistence()
    const requests: Array<{ requestId: string; requestHash: string; operationId: string }> = []
    let attempts = 0
    const apply = vi.fn<TrackerShadowSyncRpc['applyBatch']>(async (_token, input) => {
      requests.push({
        requestId: input.requestId,
        requestHash: input.requestHash,
        operationId: input.operations[0].operationId,
      })
      attempts += 1
      if (attempts === 1) throw new Error('response lost after server commit')
      return {
        status: 'replayed',
        requestId: input.requestId,
        requestHash: input.requestHash,
        accountEpoch: 1,
        cursor: 1,
        results: input.operations.map((operation) => ({
          operationId: operation.operationId,
          entityKind: operation.entityKind,
          entityId: operation.entityId,
          status: 'duplicate',
          version: 1,
          cursor: 1,
          reason: null,
        })),
      }
    })
    const sync = runtime({ persistence, rpc: successfulRpc({ apply }) })

    await expect(sync.flush('2026-12-01')).rejects.toThrow('response lost')
    expect(persistence.states.get(accountA)?.sealedBatch).not.toBeNull()
    await sync.flush('2026-12-01')

    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(persistence.states.get(accountA)?.sealedBatch).toBeNull()
    expect(persistence.states.get(accountA)?.lastValidation?.requestStatus).toBe('replayed')
  })

  it('rebases the queue when a whole-dataset mutation advances the local epoch', async () => {
    const persistence = new MemoryPersistence()
    persistence.states.set(accountA, {
      ...createTrackerShadowSyncAccountState({
        accountUserId: accountA,
        deviceId: 'stable-device',
        localDataEpoch: 'old-local-epoch',
        now,
      }),
      hasObservedExamDate: true,
      observedExamDate: '2026-09-01',
      nextLocalSequence: 8,
    })
    const rpc = successfulRpc()

    await runtime({
      persistence,
      rpc,
      ids: ['fresh-device', 'fresh-operation', 'fresh-request'],
    }).flush('2026-12-01')

    expect(rpc.applyBatch).toHaveBeenCalledWith('verified-account-token', expect.objectContaining({
      deviceId: 'fresh-device',
      operations: [expect.objectContaining({
        operationId: 'fresh-operation',
        localSequence: 1,
        payload: { examDate: '2026-12-01' },
      })],
    }))
  })

  it('takes a shadow snapshot and reseals after the server requires recovery', async () => {
    const persistence = new MemoryPersistence()
    let attempts = 0
    const apply = vi.fn<TrackerShadowSyncRpc['applyBatch']>(async (_token, input) => {
      attempts += 1
      if (attempts === 1) {
        return {
          status: 'snapshot_required', requestId: input.requestId, requestHash: input.requestHash,
          accountEpoch: 1, cursor: 1, results: [],
        }
      }
      return {
        status: 'applied', requestId: input.requestId, requestHash: input.requestHash,
        accountEpoch: 1, cursor: 2,
        results: input.operations.map(operation => ({
          operationId: operation.operationId, entityKind: operation.entityKind,
          entityId: operation.entityId, status: 'applied', version: 2, cursor: 2, reason: null,
        })),
      }
    })
    const rpc = successfulRpc({ apply })
    const sync = runtime({
      persistence,
      rpc,
      ids: ['device-1', 'operation-1', 'request-1', 'operation-2', 'request-2'],
    })

    await sync.flush('2026-12-01')
    expect(rpc.getSnapshot).toHaveBeenCalledTimes(1)
    expect(persistence.states.get(accountA)?.pendingOperations[0]).toMatchObject({
      operationId: 'operation-2', baseVersion: 1, localSequence: 2,
    })
    await sync.flush('2026-12-01')
    expect(apply).toHaveBeenCalledTimes(2)
    expect(persistence.states.get(accountA)?.sealedBatch).toBeNull()
  })

  it('drains the latest edit that arrives while an upload is already active', async () => {
    const persistence = new MemoryPersistence()
    let releaseFirstApply: (() => void) | null = null
    let applyCount = 0
    const apply = vi.fn<TrackerShadowSyncRpc['applyBatch']>(async (_token, input) => {
      applyCount += 1
      if (applyCount === 1) {
        await new Promise<void>((resolve) => { releaseFirstApply = resolve })
      }
      return {
        status: 'applied',
        requestId: input.requestId,
        requestHash: input.requestHash,
        accountEpoch: 1,
        cursor: applyCount,
        results: input.operations.map((operation) => ({
          operationId: operation.operationId,
          entityKind: operation.entityKind,
          entityId: operation.entityId,
          status: 'applied',
          version: applyCount,
          cursor: applyCount,
          reason: null,
        })),
      }
    })
    const sync = runtime({
      persistence,
      rpc: successfulRpc({ apply }),
      ids: ['device', 'op-1', 'request-1', 'op-2', 'request-2'],
    })

    const first = sync.flush('2026-12-01')
    await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(1))
    const second = sync.flush('2027-01-15')
    if (!releaseFirstApply) throw new Error('first apply did not start')
    ;(releaseFirstApply as () => void)()
    await Promise.all([first, second])

    expect(apply).toHaveBeenCalledTimes(2)
    expect(apply.mock.calls[1][1].operations[0].payload).toEqual({ examDate: '2027-01-15' })
    expect(persistence.states.get(accountA)?.observedExamDate).toBe('2027-01-15')
  })
})
