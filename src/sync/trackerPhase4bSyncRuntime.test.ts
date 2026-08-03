import { describe, expect, it, vi } from 'vitest'

import type { StudyPlan } from '@/lib/types'
import {
  createTrackerPhase4bPayload,
  diffTrackerPhase4bLocalEntities,
  inspectTrackerPhase4bLocalSnapshot,
  materializeTrackerPhase4bLocalEntities,
  mergeTrackerPhase4bRemoteEntityChanges,
  parseTrackerPhase4bRemoteEntity,
  type TrackerPhase4bLocalSnapshot,
} from '@/sync/trackerPhase4bRecordSync'
import {
  createTrackerPhase4bSyncAccountState,
  type TrackerPhase4bSyncAccountState,
  type TrackerPhase4bSyncOperation,
  type TrackerPhase4bSyncPersistence,
} from '@/sync/trackerPhase4bSyncPersistence'
import {
  reconcileTrackerPhase4bState,
  TrackerPhase4bSyncRuntime,
  trackerPhase4bRuntimeInternals,
  type TrackerPhase4bSyncRpc,
} from '@/sync/trackerPhase4bSyncRuntime'
import { TrackerShadowSyncRpcError } from '@/sync/trackerShadowSyncRpc'

const accountUserId = '10000000-0000-4000-8000-000000000001'
const t0 = '2026-08-03T00:00:00.000Z'
const t1 = '2026-08-03T01:00:00.000Z'

function plan(id = 'plan-1'): StudyPlan {
  return {
    id,
    title: '阅读计划',
    category: 'reading',
    frequency: 'daily',
    isActive: true,
    createdAt: t0,
    updatedAt: t1,
  }
}

function snapshot(input: Partial<TrackerPhase4bLocalSnapshot> = {}): TrackerPhase4bLocalSnapshot {
  return {
    studyPlans: [plan()],
    planExecutions: [],
    practiceRecords: [],
    timerRecords: [],
    ...input,
  }
}

class MemoryPersistence implements TrackerPhase4bSyncPersistence {
  state: TrackerPhase4bSyncAccountState | null = null

  async load(): Promise<TrackerPhase4bSyncAccountState | null> {
    return this.state ? structuredClone(this.state) : null
  }

  async save(state: TrackerPhase4bSyncAccountState): Promise<void> {
    this.state = structuredClone(state)
  }
}

function idFactory() {
  let value = 1
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, '0')}`
}

function capabilities(currentCursor = 0) {
  return {
    product: 'tracker',
    schemaVersion: 1,
    protocolVersion: 1,
    enabled: true,
    accountEpoch: 1,
    currentCursor,
    allowedEntityKinds: ['study_plan', 'plan_execution', 'practice_record', 'timer_record'],
    maxBatchSize: 50,
    maxPayloadBytes: 64 * 1024,
  }
}

describe('Phase 4B runtime contract', () => {
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
      label: 'TRACKER_SNAPSHOT_REQUIRED sentinel',
      error: new TrackerShadowSyncRpcError({
        httpStatus: 409,
        rpcCode: 'P0001',
        serverMessage: 'TRACKER_SNAPSHOT_REQUIRED',
      }),
    },
  ])('falls back from an incremental pull to a full snapshot for $label', async ({ error }) => {
    const persistence = new MemoryPersistence()
    persistence.state = createTrackerPhase4bSyncAccountState({
      accountUserId,
      deviceId: '20000000-0000-4000-8000-000000000001',
      localDataEpoch: 'initial',
      now: t0,
    })
    persistence.state.accountEpoch = 1
    persistence.state.cursor = 1
    persistence.state.baselineEstablished = true

    const pull = vi.fn(async () => { throw error })
    const getSnapshot = vi.fn(async () => ({
      enabled: true,
      accountEpoch: 1,
      cursor: 2,
      generatedAt: t1,
      snapshotHash: 'recovered-snapshot',
      entities: [],
    }))
    const rpc: TrackerPhase4bSyncRpc = {
      getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
      getCapabilities: async () => capabilities(2),
      getSnapshot,
      applyBatch: async () => { throw new Error('apply should not run') },
      pull,
    }
    const runtime = new TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc,
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'initial',
      readLocalSnapshot: () => snapshot({ studyPlans: [] }),
      installLocalSnapshot: async ({ snapshot: installed }) => ({ status: 'unchanged', snapshot: installed }),
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()

    expect(pull).toHaveBeenCalledTimes(1)
    expect(getSnapshot).toHaveBeenCalledTimes(1)
    expect(persistence.state?.cursor).toBe(2)
    expect(persistence.state?.baselineEstablished).toBe(true)
  })

  it('does not hide an ordinary pull/network error behind a full snapshot', async () => {
    const persistence = new MemoryPersistence()
    persistence.state = createTrackerPhase4bSyncAccountState({
      accountUserId,
      deviceId: '20000000-0000-4000-8000-000000000001',
      localDataEpoch: 'initial',
      now: t0,
    })
    persistence.state.accountEpoch = 1
    persistence.state.cursor = 1
    persistence.state.baselineEstablished = true

    const networkError = new TypeError('Failed to fetch')
    const getSnapshot = vi.fn()
    const rpc: TrackerPhase4bSyncRpc = {
      getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
      getCapabilities: async () => capabilities(2),
      getSnapshot,
      applyBatch: async () => { throw new Error('apply should not run') },
      pull: async () => { throw networkError },
    }
    const runtime = new TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc,
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'initial',
      readLocalSnapshot: () => snapshot({ studyPlans: [] }),
      installLocalSnapshot: async ({ snapshot: installed }) => ({ status: 'unchanged', snapshot: installed }),
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await expect(runtime.flush()).rejects.toBe(networkError)
    expect(getSnapshot).not.toHaveBeenCalled()
    expect(persistence.state?.cursor).toBe(1)
  })

  it('sorts dependencies before assigning strictly increasing sequences and ignores preferences', async () => {
    const local = snapshot({
      planExecutions: [{
        id: 'execution-1',
        planId: 'plan-1',
        date: '2026-08-03',
        isCompleted: true,
        updatedAt: t1,
      }],
    })
    const persistence = new MemoryPersistence()
    const appliedOperations: TrackerPhase4bSyncOperation[] = []
    const rpc: TrackerPhase4bSyncRpc = {
      getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
      getCapabilities: async () => capabilities(),
      getSnapshot: async () => ({
        enabled: true,
        accountEpoch: 1,
        cursor: 0,
        generatedAt: t0,
        snapshotHash: 'empty',
        entities: [],
      }),
      applyBatch: async (_token, input) => {
        appliedOperations.push(...input.operations)
        return {
          status: 'applied',
          requestId: input.requestId,
          requestHash: input.requestHash,
          accountEpoch: 1,
          cursor: 2,
          results: input.operations.map((operation, index) => ({
            operationId: operation.operationId,
            entityKind: operation.entityKind,
            entityId: operation.entityId,
            status: 'applied',
            version: 1,
            cursor: index + 1,
          })),
        }
      },
      pull: async () => ({
        enabled: true,
        accountEpoch: 1,
        cursor: 0,
        nextCursor: 3,
        hasMore: false,
        changes: [
          {
            cursor: 1,
            entityKind: 'tracker_preferences',
            entityId: 'preferences',
            version: 1,
            payload: { examDate: null },
            deletedAt: null,
            updatedAt: t1,
          },
          ...(appliedOperations.map((operation, index) => ({
            cursor: index + 2,
            entityKind: operation.entityKind,
            entityId: operation.entityId,
            version: 1,
            payload: operation.payload ?? null,
            deletedAt: null,
            updatedAt: t1,
          }))),
        ],
      }),
    }
    const runtime = new TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc,
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'initial',
      readLocalSnapshot: () => local,
      installLocalSnapshot: async ({ snapshot: installed }) => ({ status: 'unchanged', snapshot: installed }),
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()

    expect(appliedOperations.map((operation) => operation.entityKind)).toEqual([
      'study_plan',
      'plan_execution',
    ])
    expect(appliedOperations.map((operation) => operation.localSequence)).toEqual([1, 2])
    expect(persistence.state?.cursor).toBe(3)
    expect(persistence.state?.baseline.map((entity) => entity.entityKind)).toEqual([
      'plan_execution',
      'study_plan',
    ])
  })

  it('keeps a rejected operation local and does not rebuild the same diagnostic on the next flush', async () => {
    const local = snapshot({
      practiceRecords: [{
        id: 'mock-1',
        type: 'reading',
        date: '2026-08-03',
        duration: 60,
        createdAt: t0,
        updatedAt: t1,
      }],
    })
    const persistence = new MemoryPersistence()
    let applyCount = 0
    let sent: TrackerPhase4bSyncOperation[] = []
    const rpc: TrackerPhase4bSyncRpc = {
      getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
      getCapabilities: async () => capabilities(persistence.state?.cursor ?? 0),
      getSnapshot: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, generatedAt: t0, snapshotHash: 'empty', entities: [] }),
      applyBatch: async (_token, input) => {
        applyCount += 1
        sent = structuredClone(input.operations) as TrackerPhase4bSyncOperation[]
        return {
          status: 'applied', requestId: input.requestId, requestHash: input.requestHash,
          accountEpoch: 1, cursor: 1,
          results: input.operations.map((operation, index) => ({
            operationId: operation.operationId,
            entityKind: operation.entityKind,
            entityId: operation.entityId,
            status: operation.entityKind === 'practice_record' ? 'rejected' : 'applied',
            reason: operation.entityKind === 'practice_record' ? 'invalid_payload' : null,
            version: operation.entityKind === 'practice_record' ? 0 : 1,
            cursor: index + 1,
          })),
        }
      },
      pull: async () => ({
        enabled: true, accountEpoch: 1, cursor: 0, nextCursor: 1, hasMore: false,
        changes: sent.filter((operation) => operation.entityKind === 'study_plan').map((operation) => ({
          cursor: 1, entityKind: operation.entityKind, entityId: operation.entityId,
          version: 1, payload: operation.payload, deletedAt: null, updatedAt: t1,
        })),
      }),
    }
    const runtime = new TrackerPhase4bSyncRuntime({
      accountUserId, persistence, rpc,
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'initial',
      readLocalSnapshot: () => local,
      installLocalSnapshot: async ({ snapshot: installed }) => ({ status: 'unchanged', snapshot: installed }),
      now: () => new Date(t1), createId: idFactory(),
    })

    await runtime.flush()
    await runtime.flush()

    expect(applyCount).toBe(1)
    expect(persistence.state?.blockedOperations).toHaveLength(1)
    expect(persistence.state?.sealedBatch).toBeNull()
    expect(persistence.state?.pendingOperations).toEqual([])
  })

  it('checkpoints an accepted batch before post-apply validation so later mutations are not starved', async () => {
    const local = snapshot()
    const persistence = new MemoryPersistence()
    let serverCursor = 0
    let applyCount = 0
    let failPostApplyPull = true
    let applied: TrackerPhase4bSyncOperation | null = null
    const rpc: TrackerPhase4bSyncRpc = {
      getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
      getCapabilities: async () => capabilities(serverCursor),
      getSnapshot: async () => ({
        enabled: true,
        accountEpoch: 1,
        cursor: 0,
        generatedAt: t0,
        snapshotHash: 'empty',
        entities: [],
      }),
      applyBatch: async (_token, input) => {
        applyCount += 1
        applied = structuredClone(input.operations[0]) as TrackerPhase4bSyncOperation
        serverCursor = 1
        return {
          status: 'applied',
          requestId: input.requestId,
          requestHash: input.requestHash,
          accountEpoch: 1,
          cursor: serverCursor,
          results: [{
            operationId: input.operations[0].operationId,
            entityKind: input.operations[0].entityKind,
            entityId: input.operations[0].entityId,
            status: 'applied',
            version: 1,
            cursor: serverCursor,
          }],
        }
      },
      pull: async () => {
        if (failPostApplyPull) {
          failPostApplyPull = false
          throw new TypeError('post-apply validation network failure')
        }
        if (!applied) throw new Error('expected an applied operation')
        return {
          enabled: true,
          accountEpoch: 1,
          cursor: 0,
          nextCursor: serverCursor,
          hasMore: false,
          changes: [{
            cursor: serverCursor,
            entityKind: applied.entityKind,
            entityId: applied.entityId,
            version: 1,
            payload: applied.payload,
            deletedAt: null,
            updatedAt: t1,
          }],
        }
      },
    }
    const runtime = new TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc,
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'initial',
      readLocalSnapshot: () => local,
      installLocalSnapshot: async ({ snapshot: installed }) => ({ status: 'unchanged', snapshot: installed }),
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await expect(runtime.flush()).rejects.toThrow('post-apply validation network failure')
    expect(persistence.state?.sealedBatch).toBeNull()

    await runtime.flush()

    expect(applyCount).toBe(1)
    expect(persistence.state?.cursor).toBe(1)
    expect(persistence.state?.sealedBatch).toBeNull()
  })

  it('inherits the execution business key when the real tombstone has payload null', () => {
    const payload = createTrackerPhase4bPayload('plan_execution', {
      id: 'execution-random',
      planId: 'plan-1',
      date: '2026-08-03',
      isCompleted: true,
      updatedAt: t1,
    })
    const live = parseTrackerPhase4bRemoteEntity({
      entityKind: 'plan_execution', entityId: 'execution-random', version: 1, cursor: 1,
      payload, deletedAt: null, updatedAt: t0,
    })
    const tombstone = parseTrackerPhase4bRemoteEntity({
      entityKind: 'plan_execution', entityId: 'execution-random', version: 2, cursor: 2,
      payload: null, deletedAt: t1, updatedAt: t1,
    })

    const merged = mergeTrackerPhase4bRemoteEntityChanges({
      baseline: [live], changes: [tombstone], occurredAt: t1,
    })

    expect(merged.entities).toHaveLength(1)
    expect(merged.entities[0]).toMatchObject({
      entityId: 'execution-random',
      semanticKey: live.semanticKey,
      deletedAt: t1,
    })
  })

  it('treats a row missing from an authoritative snapshot as removed instead of resurrecting it', () => {
    const localPlan = materializeTrackerPhase4bLocalEntities(snapshot(), t1)[0]
    const baseline = parseTrackerPhase4bRemoteEntity({
      entityKind: 'study_plan', entityId: 'plan-1', version: 1, cursor: 1,
      payload: localPlan.payload, deletedAt: null, updatedAt: t0,
    })
    const remote = mergeTrackerPhase4bRemoteEntityChanges({
      baseline: [baseline], changes: [], occurredAt: t1, authoritativeSnapshot: true,
    })
    const result = reconcileTrackerPhase4bState({
      baseline: [baseline], current: [localPlan], remote: remote.entities,
      physicallyRemoved: remote.physicallyRemoved, occurredAt: t1,
    })

    expect(result.snapshot.studyPlans).toEqual([])
    expect(result.operations).toEqual([])
  })

  it('quarantines an oversized synced row without turning it into a cloud delete', () => {
    const valid = snapshot()
    const localPlan = materializeTrackerPhase4bLocalEntities(valid, t1)[0]
    const baseline = parseTrackerPhase4bRemoteEntity({
      entityKind: 'study_plan', entityId: 'plan-1', version: 1, cursor: 1,
      payload: localPlan.payload, deletedAt: null, updatedAt: t0,
    })
    const inspection = inspectTrackerPhase4bLocalSnapshot(snapshot({
      studyPlans: [{ ...plan(), description: '雅'.repeat(2_000) }],
    }))
    const current = materializeTrackerPhase4bLocalEntities(inspection.snapshot, t1)
    const diff = diffTrackerPhase4bLocalEntities([baseline], current, t1)
    const safe = trackerPhase4bRuntimeInternals.filterQuarantinedDeletes(
      diff.operations,
      inspection.quarantined,
    )

    expect(inspection.quarantined).toEqual([expect.objectContaining({
      entityKind: 'study_plan', entityId: 'plan-1',
    })])
    expect(safe).toEqual([])
  })
})
