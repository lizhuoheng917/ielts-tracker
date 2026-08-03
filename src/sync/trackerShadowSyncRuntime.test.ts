import { describe, expect, it, vi } from 'vitest'

import {
  createTrackerShadowSyncAccountState,
  type TrackerShadowSyncAccountState,
  type TrackerShadowSyncPersistence,
} from '@/sync/trackerShadowSyncPersistence'
import { TrackerShadowSyncRuntime } from '@/sync/trackerShadowSyncRuntime'
import {
  TrackerShadowSyncRpcError,
  type TrackerShadowSyncRpc,
} from '@/sync/trackerShadowSyncRpc'
import type {
  TrackerShadowSyncOperation,
  TrackerSyncApplyResult,
  TrackerSyncPullResult,
  TrackerSyncSnapshotResult,
} from '@/sync/trackerShadowSyncProtocol'

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
  remoteExists?: boolean
} = {}): TrackerShadowSyncRpc {
  let remoteExists = options.remoteExists ?? true
  let remoteExamDate = options.remoteExamDate === undefined ? '2026-12-01' : options.remoteExamDate
  let remoteVersion = remoteExists ? 1 : 0
  let remoteCursor = remoteExists ? 1 : 0
  const apply = options.apply ?? (async (_token, input) => ({
    status: 'applied' as const,
    requestId: input.requestId,
    requestHash: input.requestHash,
    accountEpoch: 1,
    cursor: remoteCursor + 1,
    results: input.operations.map((operation: TrackerShadowSyncOperation) => ({
      operationId: operation.operationId,
      entityKind: operation.entityKind,
      entityId: operation.entityId,
      status: 'applied' as const,
      version: remoteVersion + 1,
      cursor: remoteCursor + 1,
      reason: null,
    })),
  }))

  const remoteEntities = () => remoteExists ? [{
    cursor: remoteCursor,
    entityKind: 'tracker_preferences',
    entityId: 'preferences',
    version: remoteVersion,
    payload: { examDate: remoteExamDate },
    deletedAt: null,
    updatedAt: now,
  }] : []

  return {
    getVerifiedIdentity: vi.fn(async () => ({
      accountUserId: options.accountUserId ?? accountA,
      accessToken: 'verified-account-token',
    })),
    getCapabilities: vi.fn(async () => ({
      ...capabilities(options.enabled ?? true),
      currentCursor: remoteCursor,
    })),
    applyBatch: vi.fn(async (token, input) => {
      const result = await apply(token, input) as TrackerSyncApplyResult
      const accepted = result.results.filter((item) => item.status === 'applied' || item.status === 'duplicate')
      const latest = input.operations.at(-1)
      if ((result.status === 'applied' || result.status === 'replayed') && latest && accepted.length > 0) {
        remoteExists = true
        remoteExamDate = latest.payload.examDate
        remoteVersion = Math.max(remoteVersion, ...accepted.map((item) => item.version))
        remoteCursor = Math.max(remoteCursor, result.cursor, ...accepted.map((item) => item.cursor))
      }
      return result
    }),
    pull: vi.fn(async () => ({
      enabled: true,
      accountEpoch: 1,
      cursor: 0,
      nextCursor: remoteCursor,
      hasMore: false,
      changes: remoteEntities(),
    })),
    getSnapshot: vi.fn(async () => ({
      enabled: true,
      accountEpoch: 1,
      cursor: remoteCursor,
      generatedAt: now,
      snapshotHash: 'server-snapshot-hash',
      entities: remoteEntities(),
    })),
  }
}

function runtime(input: {
  persistence: TrackerShadowSyncPersistence
  rpc: TrackerShadowSyncRpc
  lock?: <T>(task: () => Promise<T>) => Promise<T>
  ids?: string[]
  installRemoteExamDate?: (remoteExamDate: string | null, expectedLocalExamDate: string | null) => string | null
  readLocalExamDate?: () => string | null
  onStatusChange?: ConstructorParameters<typeof TrackerShadowSyncRuntime>[0]['onStatusChange']
}) {
  const ids = input.ids ?? ['device-1', 'operation-1', 'request-1']
  return new TrackerShadowSyncRuntime({
    accountUserId: accountA,
    persistence: input.persistence,
    rpc: input.rpc,
    inspectBinding: () => ({ status: 'bound' }),
    readLocalDataEpoch: () => 'local-epoch-1',
    withMutationLock: input.lock ?? (async <T>(task: () => Promise<T>) => task()),
    installRemoteExamDate: input.installRemoteExamDate,
    readLocalExamDate: input.readLocalExamDate,
    onStatusChange: input.onStatusChange,
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

  it('installs a cloud date on a fresh empty device without echo-uploading it', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExamDate: '2027-01-15' })
    let localExamDate: string | undefined
    const sync = runtime({
      persistence,
      rpc,
      installRemoteExamDate: (remoteExamDate, expectedLocalExamDate) => {
        expect(localExamDate ?? null).toBe(expectedLocalExamDate)
        localExamDate = remoteExamDate ?? undefined
        return localExamDate ?? null
      },
    })

    await sync.flush(localExamDate)
    await sync.flush(localExamDate)

    expect(localExamDate).toBe('2027-01-15')
    expect(rpc.applyBatch).not.toHaveBeenCalled()
    expect(persistence.states.get(accountA)).toMatchObject({
      baselineEstablished: true,
      lastSyncedExamDate: '2027-01-15',
      observedExamDate: '2027-01-15',
    })
  })

  it('does not create a null cloud entity for a fresh empty device', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExists: false })

    await runtime({ persistence, rpc }).flush(undefined)

    expect(rpc.applyBatch).not.toHaveBeenCalled()
    expect(persistence.states.get(accountA)).toMatchObject({
      baselineEstablished: true,
      pendingOperations: [],
      sealedBatch: null,
    })
  })

  it('ignores Phase 4B entities that share the account snapshot and pull cursor', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExists: false })
    const foreignEntity = {
      cursor: 9,
      entityKind: 'study_plan',
      entityId: 'plan-1',
      version: 99,
      payload: {
        title: 'Listening plan',
        category: 'listening',
        startDate: '2026-08-03',
        targetDate: '2026-08-10',
        frequency: 'daily',
        isActive: true,
        createdAt: now,
      },
      deletedAt: null,
      updatedAt: now,
    }
    const originalPull = rpc.pull
    const originalSnapshot = rpc.getSnapshot
    rpc.pull = vi.fn(async (token, input) => {
      const result = await originalPull(token, input) as TrackerSyncPullResult
      return {
        ...result,
        nextCursor: Math.max(result.nextCursor, foreignEntity.cursor),
        changes: [foreignEntity, ...result.changes],
      }
    })
    rpc.getSnapshot = vi.fn(async (token, input) => {
      const result = await originalSnapshot(token, input) as TrackerSyncSnapshotResult
      return {
        ...result,
        cursor: Math.max(result.cursor, foreignEntity.cursor),
        snapshotHash: 'mixed-snapshot-hash',
        entities: [foreignEntity, ...result.entities],
      }
    })

    await expect(runtime({ persistence, rpc }).flush('2026-12-01')).resolves.toBeUndefined()

    expect(persistence.states.get(accountA)).toMatchObject({
      baselineEstablished: true,
      remoteVersion: 1,
      cursor: foreignEntity.cursor,
      pendingOperations: [],
    })
  })

  it('asks before choosing between different non-empty first-device dates', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExamDate: '2027-01-15' })
    const statuses: string[] = []
    let localExamDate: string | undefined = '2026-12-01'
    const sync = runtime({
      persistence,
      rpc,
      installRemoteExamDate: (remoteExamDate, expectedLocalExamDate) => {
        expect(localExamDate ?? null).toBe(expectedLocalExamDate)
        localExamDate = remoteExamDate ?? undefined
        return localExamDate ?? null
      },
      readLocalExamDate: () => localExamDate ?? null,
      onStatusChange: (status) => statuses.push(status.phase),
    })

    await sync.flush(localExamDate)
    expect(statuses).toContain('needs_choice')
    expect(localExamDate).toBe('2026-12-01')
    expect(rpc.applyBatch).not.toHaveBeenCalled()

    // An explicit cloud choice must still win if the learner edited the input
    // after the conflict card appeared but before clicking the button.
    localExamDate = '2028-02-02'
    await sync.resolveBaselineConflict('remote')
    expect(localExamDate).toBe('2027-01-15')
    expect(rpc.applyBatch).not.toHaveBeenCalled()
  })

  it('advances the shared cursor with a paged pull when only a study plan changed', async () => {
    const persistence = new MemoryPersistence()
    persistence.states.set(accountA, {
      ...createTrackerShadowSyncAccountState({
        accountUserId: accountA,
        deviceId: 'device-1',
        localDataEpoch: 'local-epoch-1',
        now,
      }),
      accountEpoch: 1,
      cursor: 1,
      remoteVersion: 1,
      baselineEstablished: true,
      lastSyncedExamDate: '2026-12-01',
      hasObservedExamDate: true,
      observedExamDate: '2026-12-01',
    })
    const rpc = successfulRpc({ remoteExamDate: '2026-12-01' })
    rpc.getCapabilities = vi.fn(async () => ({ ...capabilities(), currentCursor: 3 }))
    rpc.pull = vi.fn(async (_token, input) => ({
      enabled: true,
      accountEpoch: 1,
      cursor: input.cursor,
      nextCursor: input.cursor + 1,
      hasMore: input.cursor === 1,
      changes: [{
        cursor: input.cursor + 1,
        entityKind: 'study_plan',
        entityId: `plan-${input.cursor}`,
        version: 1,
        payload: { title: 'Listening plan' },
        deletedAt: null,
        updatedAt: now,
      }],
    }))

    await runtime({ persistence, rpc }).flush('2026-12-01')

    expect(rpc.pull).toHaveBeenCalledWith('verified-account-token', expect.objectContaining({
      cursor: 1,
      limit: 100,
    }))
    expect(rpc.pull).toHaveBeenNthCalledWith(2, 'verified-account-token', expect.objectContaining({
      cursor: 2,
      limit: 100,
    }))
    expect(rpc.getSnapshot).not.toHaveBeenCalled()
    expect(rpc.applyBatch).not.toHaveBeenCalled()
    expect(persistence.states.get(accountA)).toMatchObject({
      cursor: 3,
      remoteVersion: 1,
      lastSyncedExamDate: '2026-12-01',
    })
  })

  it('installs a one-sided cloud change after baseline and does not echo it', async () => {
    const persistence = new MemoryPersistence()
    persistence.states.set(accountA, {
      ...createTrackerShadowSyncAccountState({
        accountUserId: accountA,
        deviceId: 'device-1',
        localDataEpoch: 'local-epoch-1',
        now,
      }),
      accountEpoch: 1,
      baselineEstablished: true,
      lastSyncedExamDate: '2026-12-01',
      hasObservedExamDate: true,
      observedExamDate: '2026-12-01',
      remoteVersion: 1,
    })
    const rpc = successfulRpc({ remoteExamDate: '2027-01-15' })
    let localExamDate: string | undefined = '2026-12-01'
    const sync = runtime({
      persistence,
      rpc,
      installRemoteExamDate: (remoteExamDate, expectedLocalExamDate) => {
        expect(localExamDate ?? null).toBe(expectedLocalExamDate)
        localExamDate = remoteExamDate ?? undefined
        return localExamDate ?? null
      },
    })

    await sync.flush(localExamDate)
    await sync.flush(localExamDate)

    expect(localExamDate).toBe('2027-01-15')
    expect(rpc.applyBatch).not.toHaveBeenCalled()
    expect(rpc.pull).toHaveBeenCalledTimes(1)
    expect(rpc.getSnapshot).not.toHaveBeenCalled()
    expect(persistence.states.get(accountA)?.lastSyncedExamDate).toBe('2027-01-15')
  })

  it.each([
    {
      label: 'SQLSTATE 40001',
      error: new TrackerShadowSyncRpcError({
        httpStatus: 409,
        rpcCode: '40001',
        serverMessage: 'serialization failure',
      }),
    },
    {
      label: 'TRACKER_SNAPSHOT_REQUIRED',
      error: new TrackerShadowSyncRpcError({
        httpStatus: 409,
        rpcCode: 'P0001',
        serverMessage: 'TRACKER_SNAPSHOT_REQUIRED',
      }),
    },
  ])('falls back to one full snapshot when an established pull reports $label', async ({ error }) => {
    const persistence = new MemoryPersistence()
    persistence.states.set(accountA, {
      ...createTrackerShadowSyncAccountState({
        accountUserId: accountA,
        deviceId: 'device-1',
        localDataEpoch: 'local-epoch-1',
        now,
      }),
      accountEpoch: 1,
      cursor: 1,
      remoteVersion: 1,
      baselineEstablished: true,
      lastSyncedExamDate: '2026-12-01',
      hasObservedExamDate: true,
      observedExamDate: '2026-12-01',
    })
    const rpc = successfulRpc({ remoteExamDate: '2026-12-01' })
    rpc.getCapabilities = vi.fn(async () => ({ ...capabilities(), currentCursor: 2 }))
    rpc.pull = vi.fn(async () => { throw error })
    rpc.getSnapshot = vi.fn(async () => ({
      enabled: true,
      accountEpoch: 1,
      cursor: 2,
      generatedAt: now,
      snapshotHash: 'recovery-snapshot',
      entities: [{
        cursor: 2,
        entityKind: 'tracker_preferences',
        entityId: 'preferences',
        version: 2,
        payload: { examDate: '2027-01-15' },
        deletedAt: null,
        updatedAt: now,
      }],
    }))
    let localExamDate: string | undefined = '2026-12-01'

    await runtime({
      persistence,
      rpc,
      installRemoteExamDate: (remoteExamDate) => {
        localExamDate = remoteExamDate ?? undefined
        return remoteExamDate
      },
    }).flush(localExamDate)

    expect(rpc.pull).toHaveBeenCalledTimes(1)
    expect(rpc.getSnapshot).toHaveBeenCalledTimes(1)
    expect(localExamDate).toBe('2027-01-15')
    expect(persistence.states.get(accountA)).toMatchObject({
      cursor: 2,
      remoteVersion: 2,
      lastSyncedExamDate: '2027-01-15',
    })
  })

  it('does not replace an ordinary established pull failure with a snapshot', async () => {
    const persistence = new MemoryPersistence()
    persistence.states.set(accountA, {
      ...createTrackerShadowSyncAccountState({
        accountUserId: accountA,
        deviceId: 'device-1',
        localDataEpoch: 'local-epoch-1',
        now,
      }),
      accountEpoch: 1,
      cursor: 1,
      remoteVersion: 1,
      baselineEstablished: true,
      lastSyncedExamDate: '2026-12-01',
      hasObservedExamDate: true,
      observedExamDate: '2026-12-01',
    })
    const rpc = successfulRpc({ remoteExamDate: '2026-12-01' })
    rpc.getCapabilities = vi.fn(async () => ({ ...capabilities(), currentCursor: 2 }))
    const networkError = new TypeError('Failed to fetch')
    rpc.pull = vi.fn(async () => { throw networkError })

    await expect(runtime({ persistence, rpc }).flush('2026-12-01')).rejects.toBe(networkError)

    expect(rpc.getSnapshot).not.toHaveBeenCalled()
    expect(persistence.states.get(accountA)?.cursor).toBe(1)
  })

  it('uploads an explicit local clear after a baseline exists', async () => {
    const persistence = new MemoryPersistence()
    persistence.states.set(accountA, {
      ...createTrackerShadowSyncAccountState({
        accountUserId: accountA,
        deviceId: 'device-1',
        localDataEpoch: 'local-epoch-1',
        now,
      }),
      accountEpoch: 1,
      cursor: 1,
      remoteVersion: 1,
      baselineEstablished: true,
      lastSyncedExamDate: '2026-12-01',
      hasObservedExamDate: true,
      observedExamDate: '2026-12-01',
    })
    const rpc = successfulRpc({ remoteExamDate: '2026-12-01' })

    await runtime({ persistence, rpc }).flush(undefined)

    expect(rpc.applyBatch).toHaveBeenCalledWith('verified-account-token', expect.objectContaining({
      operations: [expect.objectContaining({ payload: { examDate: null } })],
    }))
  })

  it('uploads only examDate after a fresh snapshot confirms the cloud is empty', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExists: false })
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
    expect(rpc.getSnapshot).toHaveBeenCalledTimes(2)
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
    const sync = runtime({ persistence, rpc: successfulRpc({ apply, remoteExists: false }) })

    await expect(sync.flush('2026-12-01')).rejects.toThrow('response lost')
    expect(persistence.states.get(accountA)?.sealedBatch).not.toBeNull()
    await sync.flush('2026-12-01')

    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(persistence.states.get(accountA)?.sealedBatch).toBeNull()
    expect(persistence.states.get(accountA)?.lastValidation?.requestStatus).toBe('replayed')
  })

  it('preserves both values when an optimistic apply finds a concurrent cloud edit', async () => {
    const persistence = new MemoryPersistence()
    const rpc = successfulRpc({ remoteExists: false })
    rpc.applyBatch = vi.fn(async (
      _token: string,
      input: Parameters<TrackerShadowSyncRpc['applyBatch']>[1],
    ) => ({
      status: 'applied',
      requestId: input.requestId,
      requestHash: input.requestHash,
      accountEpoch: 1,
      cursor: 1,
      results: input.operations.map((operation) => ({
        operationId: operation.operationId,
        entityKind: operation.entityKind,
        entityId: operation.entityId,
        status: 'conflict' as const,
        version: 1,
        cursor: 1,
        reason: 'version_conflict',
      })),
    }))
    vi.mocked(rpc.getSnapshot)
      .mockResolvedValueOnce({
        enabled: true,
        accountEpoch: 1,
        cursor: 0,
        generatedAt: now,
        snapshotHash: 'empty',
        entities: [],
      })
      .mockResolvedValue({
        enabled: true,
        accountEpoch: 1,
        cursor: 1,
        generatedAt: now,
        snapshotHash: 'concurrent',
        entities: [{
          cursor: 1,
          entityKind: 'tracker_preferences',
          entityId: 'preferences',
          version: 1,
          payload: { examDate: '2027-01-15' },
          deletedAt: null,
          updatedAt: now,
        }],
      })
    const statuses: string[] = []
    const sync = runtime({
      persistence,
      rpc,
      onStatusChange: (status) => statuses.push(status.phase),
    })

    await sync.flush('2026-12-01')

    expect(statuses).toContain('needs_choice')
    expect(persistence.states.get(accountA)?.baselineConflict).toEqual({
      localExamDate: '2026-12-01',
      remoteExamDate: '2027-01-15',
    })
    expect(persistence.states.get(accountA)?.sealedBatch).toBeNull()
    expect(persistence.states.get(accountA)?.pendingOperations).toEqual([])
    expect(rpc.applyBatch).toHaveBeenCalledTimes(1)
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
    const rpc = successfulRpc({ remoteExists: false })

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
    const rpc = successfulRpc({ apply, remoteExists: false })
    const sync = runtime({
      persistence,
      rpc,
      ids: ['device-1', 'operation-1', 'request-1', 'operation-2', 'request-2'],
    })

    await sync.flush('2026-12-01')
    expect(rpc.getSnapshot).toHaveBeenCalledTimes(2)
    expect(persistence.states.get(accountA)?.pendingOperations[0]).toMatchObject({
      operationId: 'operation-2', baseVersion: 0, localSequence: 2,
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
      rpc: successfulRpc({ apply, remoteExists: false }),
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
