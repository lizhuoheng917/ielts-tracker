import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StudyPlan, WordRecord } from '@/lib/types'
import type { TrackerPhase4bLocalSnapshot } from '@/sync/trackerPhase4bRecordSync'
import type { TrackerPhase4bSyncAccountState } from '@/sync/trackerPhase4bSyncPersistence'

const accountUserId = '10000000-0000-4000-8000-000000000001'
const t0 = '2026-08-04T00:00:00.000Z'
const t1 = '2026-08-04T01:00:00.000Z'

let runtimeModule: typeof import('@/sync/trackerPhase4bSyncRuntime')
let policyModule: typeof import('@/sync/trackerContentCloudPolicy')
let recordSyncModule: typeof import('@/sync/trackerPhase4bRecordSync')
let persistenceModule: typeof import('@/sync/trackerPhase4bSyncPersistence')

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

class MemoryPersistence {
  state: TrackerPhase4bSyncAccountState | null = null

  async load(): Promise<TrackerPhase4bSyncAccountState | null> {
    return this.state ? structuredClone(this.state) : null
  }

  async save(state: TrackerPhase4bSyncAccountState): Promise<void> {
    this.state = structuredClone(state)
  }

  async delete(): Promise<void> {
    this.state = null
  }
}

function idFactory() {
  let value = 1
  return () => `00000000-0000-4000-8000-${String(value++).padStart(12, '0')}`
}

function word(id = 'word-1'): WordRecord {
  return {
    id,
    date: '2026-08-04',
    category: '学术词汇',
    subCategory: '教育',
    count: 20,
    note: '本机优先',
    createdAt: t0,
    updatedAt: t1,
  }
}

function plan(id = 'plan-1'): StudyPlan {
  return {
    id,
    title: '阅读精练',
    category: 'reading',
    frequency: 'daily',
    isActive: true,
    createdAt: t0,
    updatedAt: t1,
  }
}

function snapshot(input: Partial<TrackerPhase4bLocalSnapshot> = {}): TrackerPhase4bLocalSnapshot {
  return {
    studyPlans: [],
    planExecutions: [],
    practiceRecords: [],
    timerRecords: [],
    wordRecords: [],
    ...input,
  }
}

function capabilities(currentCursor = 0) {
  return {
    product: 'tracker',
    schemaVersion: 1,
    protocolVersion: 1,
    enabled: true,
    accountEpoch: 1,
    currentCursor,
    selectiveContentCloudV1: true,
    selectiveContentCloudEnabled: true,
    contentQuota: {
      word_record: { limit: 10, used: 0, remaining: 10 },
    },
    allowedEntityKinds: [
      'study_plan',
      'plan_execution',
      'practice_record',
      'timer_record',
      'word_record',
    ],
    maxBatchSize: 50,
    maxPayloadBytes: 64 * 1024,
  }
}

function resetPolicy(): void {
  policyModule.useTrackerContentCloudPolicyStore.setState({
    activeScope: policyModule.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE,
    deviceScopeClaimed: false,
    selectiveCloudAvailableByScope: {},
    scopes: {
      [policyModule.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]: {
        initialized: true,
        revision: 0,
        modes: {},
        restoreRequests: {},
        failures: {},
      },
    },
    quotaByScope: {},
  })
}

describe('Tracker selected-content cloud runtime', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new MemoryStorage())
    policyModule = await import('@/sync/trackerContentCloudPolicy')
    recordSyncModule = await import('@/sync/trackerPhase4bRecordSync')
    persistenceModule = await import('@/sync/trackerPhase4bSyncPersistence')
    runtimeModule = await import('@/sync/trackerPhase4bSyncRuntime')
    resetPolicy()
  })

  it('does not turn a newly-created local record into a cloud operation', async () => {
    const persistence = new MemoryPersistence()
    const applyBatch = vi.fn()
    const installed: TrackerPhase4bLocalSnapshot[] = []
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(),
        getSnapshot: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, generatedAt: t0, snapshotHash: 'empty', entities: [] }),
        applyBatch,
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, nextCursor: 0, hasMore: false, changes: [] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => snapshot({ wordRecords: [word()] }),
      installLocalSnapshot: async ({ snapshot: value }) => {
        installed.push(value)
        return { status: 'unchanged', snapshot: value }
      },
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()

    expect(applyBatch).not.toHaveBeenCalled()
    expect(installed.at(-1)?.wordRecords).toEqual([word()])
  })

  it('sends an explicit local-to-cloud selection as one upsert with the selective marker', async () => {
    const persistence = new MemoryPersistence()
    const applied: unknown[] = []
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode('word_record', 'word-1', 'cloud', { now: t1 })
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(),
        getSnapshot: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, generatedAt: t0, snapshotHash: 'empty', entities: [] }),
        applyBatch: async (_token, input) => {
          applied.push(structuredClone(input))
          return {
            status: 'applied', requestId: input.requestId, requestHash: input.requestHash,
            accountEpoch: 1, cursor: 1,
            results: input.operations.map((operation) => ({
              operationId: operation.operationId, entityKind: operation.entityKind, entityId: operation.entityId,
              status: 'applied', version: 1, cursor: 1,
            })),
          }
        },
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, nextCursor: 1, hasMore: false, changes: [{
          cursor: 1,
          entityKind: 'word_record',
          entityId: 'word-1',
          version: 1,
          payload: recordSyncModule.createTrackerPhase4bPayload('word_record', word()),
          deletedAt: null,
          updatedAt: t1,
        }] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => snapshot({ wordRecords: [word()] }),
      installLocalSnapshot: async ({ snapshot: value }) => ({ status: 'unchanged', snapshot: value }),
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()

    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      selectiveContentCloudV1: true,
      operations: [expect.objectContaining({ entityKind: 'word_record', entityId: 'word-1', action: 'upsert' })],
    })
  })

  it('requests a remote delete after cloud-to-local and keeps the local row through the response', async () => {
    const persistence = new MemoryPersistence()
    const remote = recordSyncModule.parseTrackerPhase4bRemoteEntity({
      entityKind: 'word_record',
      entityId: 'word-1',
      version: 1,
      cursor: 1,
      payload: recordSyncModule.createTrackerPhase4bPayload('word_record', word()),
      deletedAt: null,
      updatedAt: t1,
    })
    persistence.state = persistenceModule.createTrackerPhase4bSyncAccountState({
      accountUserId,
      deviceId: '20000000-0000-4000-8000-000000000001',
      localDataEpoch: 'epoch',
      now: t0,
    })
    persistence.state.accountEpoch = 1
    persistence.state.cursor = 1
    persistence.state.baselineEstablished = true
    persistence.state.baseline = [remote]
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode('word_record', 'word-1', 'cloud', { now: t0 })
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode('word_record', 'word-1', 'local', { now: t1 })
    const applied: unknown[] = []
    const installed: TrackerPhase4bLocalSnapshot[] = []
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(1),
        getSnapshot: async () => { throw new Error('snapshot not expected') },
        applyBatch: async (_token, input) => {
          applied.push(structuredClone(input))
          return {
            status: 'applied', requestId: input.requestId, requestHash: input.requestHash,
            accountEpoch: 1, cursor: 2,
            results: input.operations.map((operation) => ({
              operationId: operation.operationId, entityKind: operation.entityKind, entityId: operation.entityId,
              status: 'applied', version: 2, cursor: 2,
            })),
          }
        },
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 1, nextCursor: 2, hasMore: false, changes: [{
          cursor: 2,
          entityKind: 'word_record',
          entityId: 'word-1',
          version: 2,
          payload: null,
          deletedAt: t1,
          updatedAt: t1,
        }] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => snapshot({ wordRecords: [word()] }),
      installLocalSnapshot: async ({ snapshot: value }) => {
        installed.push(value)
        return { status: 'unchanged', snapshot: value }
      },
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()

    expect(applied).toHaveLength(1)
    expect(applied[0]).toMatchObject({
      operations: [expect.objectContaining({ entityKind: 'word_record', entityId: 'word-1', action: 'delete' })],
    })
    expect(installed.at(-1)?.wordRecords).toEqual([word()])
  })

  it('surfaces a quota rejection for the record that remains local', async () => {
    const persistence = new MemoryPersistence()
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode('word_record', 'word-1', 'cloud', { now: t1 })
    const rejected = vi.fn()
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(),
        getSnapshot: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, generatedAt: t0, snapshotHash: 'empty', entities: [] }),
        applyBatch: async (_token, input) => ({
          status: 'applied', requestId: input.requestId, requestHash: input.requestHash,
          accountEpoch: 1, cursor: 0,
          results: input.operations.map((operation) => ({
            operationId: operation.operationId, entityKind: operation.entityKind, entityId: operation.entityId,
            status: 'rejected', reason: 'cloud_quota_reached', version: 0, cursor: 0,
          })),
        }),
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, nextCursor: 0, hasMore: false, changes: [] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => snapshot({ wordRecords: [word()] }),
      installLocalSnapshot: async ({ snapshot: value }) => ({ status: 'unchanged', snapshot: value }),
      onOperationRejected: rejected,
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()

    expect(rejected).toHaveBeenCalledWith({
      entityKind: 'word_record', entityId: 'word-1', reason: 'cloud_quota_reached',
    })
    expect(persistence.state?.blockedOperations).toEqual([expect.objectContaining({
      entityKind: 'word_record', entityId: 'word-1', reason: 'cloud_quota_reached',
    })])
  })

  it('does not keep a rejected independent upload in a fake removing state when changed back to local', async () => {
    const persistence = new MemoryPersistence()
    const applyBatch = vi.fn(async (_token: string, input: { requestId: string; requestHash: string; operations: readonly {
      operationId: string; entityKind: string; entityId: string
    }[] }) => ({
      status: 'applied', requestId: input.requestId, requestHash: input.requestHash,
      accountEpoch: 1, cursor: 0,
      results: input.operations.map((operation) => ({
        operationId: operation.operationId,
        entityKind: operation.entityKind,
        entityId: operation.entityId,
        status: 'rejected',
        reason: 'cloud_quota_reached',
        version: 0,
        cursor: 0,
      })),
    }))
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode('word_record', 'word-1', 'cloud', { now: t1 })
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(),
        getSnapshot: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, generatedAt: t0, snapshotHash: 'empty', entities: [] }),
        applyBatch,
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, nextCursor: 0, hasMore: false, changes: [] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => snapshot({ wordRecords: [word()] }),
      installLocalSnapshot: async ({ snapshot: value }) => ({ status: 'unchanged', snapshot: value }),
      onOperationRejected: ({ entityKind, entityId, reason }) => {
        policyModule.useTrackerContentCloudPolicyStore.getState().markRejected(entityKind, entityId, reason)
      },
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.flush()
    expect(applyBatch).toHaveBeenCalledTimes(1)
    expect(policyModule.trackerContentCloudFailure('word_record', 'word-1')).not.toBeNull()

    policyModule.setTrackerContentCloudLocation({ entityKind: 'word_record', entityId: 'word-1', mode: 'local' })
    expect(policyModule.trackerContentCloudTransferState('word_record', 'word-1')).toBeNull()
    expect(policyModule.trackerContentCloudFailure('word_record', 'word-1')).toBeNull()

    await runtime.flush()
    expect(applyBatch).toHaveBeenCalledTimes(1)
  })

  it('uploads a plan and all of its executions through the paired endpoint, never an ordinary batch', async () => {
    const persistence = new MemoryPersistence()
    const local = snapshot({
      studyPlans: [plan()],
      planExecutions: [{
        id: 'execution-1', planId: 'plan-1', date: '2026-08-04', isCompleted: true, updatedAt: t1,
      }],
    })
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode(
      'study_plan', 'plan-1', 'cloud', { now: t1, planTransfer: 'uploading' },
    )
    const upload = vi.fn(async (_token: string, input: { operationId: string }) => ({
      status: 'applied', operationId: input.operationId, accountEpoch: 1,
      plan: { entityId: 'plan-1', version: 1 }, executions: [{ entityId: 'execution-1', version: 1 }],
    }))
    const applyBatch = vi.fn()
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(),
        uploadPlanToCloud: upload,
        getSnapshot: async () => ({
          enabled: true, accountEpoch: 1, cursor: 2, generatedAt: t1, snapshotHash: 'plan-upload', entities: [
            {
              cursor: 1, entityKind: 'study_plan', entityId: 'plan-1', version: 1,
              payload: recordSyncModule.createTrackerPhase4bPayload('study_plan', plan()), deletedAt: null, updatedAt: t1,
            },
            {
              cursor: 2, entityKind: 'plan_execution', entityId: 'execution-1', version: 1,
              payload: recordSyncModule.createTrackerPhase4bPayload('plan_execution', local.planExecutions[0]), deletedAt: null, updatedAt: t1,
            },
          ],
        }),
        applyBatch,
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 2, nextCursor: 2, hasMore: false, changes: [] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => local,
      installLocalSnapshot: async ({ snapshot: value }) => ({ status: 'unchanged', snapshot: value }),
      now: () => new Date(t1), createId: idFactory(),
    })

    await runtime.transferPlan('plan-1', 'uploading')

    expect(upload).toHaveBeenCalledWith('token', expect.objectContaining({
      expectedUserId: accountUserId,
      bundle: expect.objectContaining({
        plan: expect.objectContaining({ entityId: 'plan-1', baseVersion: 0 }),
        executions: [expect.objectContaining({ entityId: 'execution-1', baseVersion: 0 })],
      }),
    }))
    expect(applyBatch).not.toHaveBeenCalled()
    expect(policyModule.trackerContentCloudTransferState('study_plan', 'plan-1')).toBeNull()
    expect(policyModule.trackerContentCloudMode({ entityKind: 'study_plan', entityId: 'plan-1' })).toBe('cloud')
  })

  it('detaches a plan and its executions atomically while retaining the local copy', async () => {
    const persistence = new MemoryPersistence()
    const local = snapshot({
      studyPlans: [plan()],
      planExecutions: [{
        id: 'execution-1', planId: 'plan-1', date: '2026-08-04', isCompleted: true, updatedAt: t1,
      }],
    })
    const remotePlan = recordSyncModule.parseTrackerPhase4bRemoteEntity({
      cursor: 1, entityKind: 'study_plan', entityId: 'plan-1', version: 4,
      payload: recordSyncModule.createTrackerPhase4bPayload('study_plan', plan()), deletedAt: null, updatedAt: t1,
    })
    const remoteExecution = recordSyncModule.parseTrackerPhase4bRemoteEntity({
      cursor: 2, entityKind: 'plan_execution', entityId: 'execution-1', version: 2,
      payload: recordSyncModule.createTrackerPhase4bPayload('plan_execution', local.planExecutions[0]), deletedAt: null, updatedAt: t1,
    })
    persistence.state = persistenceModule.createTrackerPhase4bSyncAccountState({
      accountUserId, deviceId: '20000000-0000-4000-8000-000000000001', localDataEpoch: 'epoch', now: t0,
    })
    persistence.state.accountEpoch = 1
    persistence.state.cursor = 2
    persistence.state.baselineEstablished = true
    persistence.state.baseline = [remotePlan, remoteExecution]
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode('study_plan', 'plan-1', 'cloud', { now: t0 })
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode(
      'study_plan', 'plan-1', 'local', { now: t1, planTransfer: 'removing' },
    )
    const detach = vi.fn(async (_token: string, input: { operationId: string }) => ({
      status: 'applied', operationId: input.operationId, accountEpoch: 1,
      plan: { entityId: 'plan-1', version: 5 }, executions: [{ entityId: 'execution-1', version: 3 }],
    }))
    const installed: TrackerPhase4bLocalSnapshot[] = []
    const applyBatch = vi.fn()
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(2),
        detachPlanFromCloud: detach,
        getSnapshot: async () => ({
          enabled: true, accountEpoch: 1, cursor: 4, generatedAt: t1, snapshotHash: 'plan-detach', entities: [
            { cursor: 3, entityKind: 'study_plan', entityId: 'plan-1', version: 5, payload: null, deletedAt: t1, updatedAt: t1 },
            { cursor: 4, entityKind: 'plan_execution', entityId: 'execution-1', version: 3, payload: null, deletedAt: t1, updatedAt: t1 },
          ],
        }),
        applyBatch,
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 4, nextCursor: 4, hasMore: false, changes: [] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => local,
      installLocalSnapshot: async ({ snapshot: value }) => {
        installed.push(value)
        return { status: 'unchanged', snapshot: value }
      },
      now: () => new Date(t1), createId: idFactory(),
    })

    await runtime.transferPlan('plan-1', 'removing')

    expect(detach).toHaveBeenCalledWith('token', expect.objectContaining({
      planId: 'plan-1', expectedPlanVersion: 4, expectedUserId: accountUserId,
    }))
    expect(applyBatch).not.toHaveBeenCalled()
    expect(installed.at(-1)).toEqual(local)
    expect(policyModule.trackerContentCloudTransferState('study_plan', 'plan-1')).toBeNull()
    expect(policyModule.trackerContentCloudMode({ entityKind: 'study_plan', entityId: 'plan-1' })).toBe('local')
  })

  it('completes a cancelled plan upload locally when an authoritative snapshot proves no cloud parent exists', async () => {
    const persistence = new MemoryPersistence()
    const local = snapshot({
      studyPlans: [plan()],
      planExecutions: [{
        id: 'execution-1', planId: 'plan-1', date: '2026-08-04', isCompleted: false, updatedAt: t1,
      }],
    })
    policyModule.useTrackerContentCloudPolicyStore.getState().setMode(
      'study_plan', 'plan-1', 'cloud', { now: t0, planTransfer: 'uploading' },
    )
    // This matches the UI path: the learner cancels before the failed upload
    // has ever created a remote parent row.
    policyModule.setTrackerContentCloudLocation({ entityKind: 'study_plan', entityId: 'plan-1', mode: 'local' })
    expect(policyModule.trackerContentCloudPlanTransferState('plan-1')).toBe('removing')

    const detach = vi.fn()
    const applyBatch = vi.fn()
    const installed: TrackerPhase4bLocalSnapshot[] = []
    const runtime = new runtimeModule.TrackerPhase4bSyncRuntime({
      accountUserId,
      persistence,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId, accessToken: 'token' }),
        getCapabilities: async () => capabilities(),
        detachPlanFromCloud: detach,
        getSnapshot: async () => ({
          enabled: true, accountEpoch: 1, cursor: 0, generatedAt: t1, snapshotHash: 'empty-plan', entities: [],
        }),
        applyBatch,
        pull: async () => ({ enabled: true, accountEpoch: 1, cursor: 0, nextCursor: 0, hasMore: false, changes: [] }),
      },
      inspectBinding: () => ({ status: 'bound' }),
      readLocalDataEpoch: () => 'epoch',
      readLocalSnapshot: () => local,
      installLocalSnapshot: async ({ snapshot: value }) => {
        installed.push(value)
        return { status: 'unchanged', snapshot: value }
      },
      now: () => new Date(t1),
      createId: idFactory(),
    })

    await runtime.transferPlan('plan-1', 'removing')

    expect(detach).not.toHaveBeenCalled()
    expect(applyBatch).not.toHaveBeenCalled()
    expect(installed.at(-1)).toEqual(local)
    expect(policyModule.trackerContentCloudPlanTransferState('plan-1')).toBeNull()
    expect(policyModule.trackerContentCloudFailure('study_plan', 'plan-1')).toBeNull()
  })
})
