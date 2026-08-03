import { inspectManagedAiDataBinding } from '@/auth/managedAiDataBinding'
import { readCanonicalMutationEpoch } from '@/data/canonicalMutationCoordinator'
import {
  diffTrackerPhase4bLocalEntities,
  inspectTrackerPhase4bLocalSnapshot,
  materializeTrackerPhase4bLocalEntities,
  mergeTrackerPhase4bRemoteEntityChanges,
  parseTrackerPhase4bRemoteEntity,
  planTrackerPhase4bReconciliation,
  sortTrackerPhase4bOperationIntents,
  TRACKER_PHASE4B_ENTITY_KINDS,
  type TrackerPhase4bLocalEntity,
  type TrackerPhase4bLocalSnapshot,
  type TrackerPhase4bOperationIntent,
  type TrackerPhase4bQuarantinedRecord,
  type TrackerPhase4bRemoteEntity,
  type TrackerPhase4bRestoreRequired,
} from '@/sync/trackerPhase4bRecordSync'
import {
  installTrackerPhase4bStoreSnapshot,
  trackerPhase4bSnapshotFingerprint,
} from '@/sync/trackerPhase4bStoreAdapter'
import {
  BrowserTrackerPhase4bSyncPersistence,
  createTrackerPhase4bSyncAccountState,
  type TrackerPhase4bBlockedOperation,
  type TrackerPhase4bSyncAccountState,
  type TrackerPhase4bSyncBatch,
  type TrackerPhase4bSyncOperation,
  type TrackerPhase4bSyncPersistence,
} from '@/sync/trackerPhase4bSyncPersistence'
import {
  parseTrackerSyncApplyResult,
  parseTrackerSyncCapabilities,
  parseTrackerSyncPullResult,
  parseTrackerSyncSnapshotResult,
  trackerSyncSha256,
  type TrackerSyncCapabilities,
} from '@/sync/trackerShadowSyncProtocol'
import {
  browserTrackerShadowSyncRpc,
  TrackerShadowSyncRpcError,
} from '@/sync/trackerShadowSyncRpc'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useTimerStore } from '@/stores/timerStore'

export const TRACKER_PHASE4B_SYNC_COALESCE_MS = 5_000
export const TRACKER_PHASE4B_MAX_BATCH_OPERATIONS = 50
export const TRACKER_PHASE4B_TARGET_BATCH_BYTES = 48 * 1024

const PULL_LIMIT = 100
const MAX_PULL_PAGES = 20
const PREFERENCES_KIND = 'tracker_preferences'
const PREFERENCES_ID = 'preferences'

export interface TrackerPhase4bSyncRpc {
  getVerifiedIdentity(): Promise<{ accountUserId: string; accessToken: string } | null>
  getCapabilities(accessToken: string): Promise<unknown>
  applyBatch(accessToken: string, input: {
    deviceId: string
    requestId: string
    requestHash: string
    accountEpoch: number
    operations: readonly TrackerPhase4bSyncOperation[]
  }): Promise<unknown>
  pull(accessToken: string, input: { deviceId: string; cursor: number; limit: number }): Promise<unknown>
  getSnapshot(accessToken: string, input: { deviceId: string }): Promise<unknown>
}

export interface TrackerPhase4bSyncStatusEvent {
  phase: 'checking' | 'syncing' | 'synced' | 'paused' | 'partial' | 'needs_choice'
  lastSyncedAt?: string
  detail?: string
  quarantinedCount?: number
  restoreRequired?: TrackerPhase4bRestoreRequired[]
}

export interface TrackerPhase4bSyncRuntimeOptions {
  accountUserId: string
  persistence?: TrackerPhase4bSyncPersistence
  rpc?: TrackerPhase4bSyncRpc
  inspectBinding?: (accountUserId: string) => { status: string }
  readLocalDataEpoch?: () => string
  readLocalSnapshot?: () => unknown
  installLocalSnapshot?: typeof installTrackerPhase4bStoreSnapshot
  onStatusChange?: (event: TrackerPhase4bSyncStatusEvent) => void
  now?: () => Date
  createId?: () => string
  setTimer?: (task: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
}

interface ReconciliationResult {
  snapshot: TrackerPhase4bLocalSnapshot
  operations: TrackerPhase4bOperationIntent[]
  restoreRequired: TrackerPhase4bRestoreRequired[]
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => T | PromiseLike<T>,
  ): Promise<T>
}

let localRuntimeQueue: Promise<void> = Promise.resolve()

function createRuntimeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  throw new Error('Phase 4B sync requires crypto.randomUUID().')
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readRawTrackerPhase4bStoreSnapshot(): unknown {
  const planState = usePlanStore.getState()
  return clone({
    studyPlans: planState.plans,
    planExecutions: planState.executions,
    practiceRecords: usePracticeStore.getState().records,
    timerRecords: useTimerStore.getState().records,
  })
}

function operationSemanticKey(
  operation: Pick<TrackerPhase4bSyncOperation, 'entityKind' | 'entityId' | 'action' | 'payload'>,
  baseline: readonly TrackerPhase4bRemoteEntity[],
): string {
  if (operation.entityKind === 'plan_execution' && operation.action === 'upsert') {
    const payload = operation.payload as { planId: string; date: string }
    return `plan_execution\u0000${payload.planId}\u001f${payload.date}`
  }
  return baseline.find((entity) => (
    entity.entityKind === operation.entityKind && entity.entityId === operation.entityId
  ))?.semanticKey ?? `${operation.entityKind}\u0000${operation.entityId}`
}

function remoteToLocal(entity: TrackerPhase4bRemoteEntity): TrackerPhase4bLocalEntity {
  if (entity.deletedAt !== null || entity.payload === null) {
    throw new Error('A tombstone cannot become a local record.')
  }
  return {
    entityKind: entity.entityKind,
    entityId: entity.entityId,
    semanticKey: entity.semanticKey,
    payload: entity.payload,
    updatedAt: entity.updatedAt,
    updatedAtSource: 'record',
  } as TrackerPhase4bLocalEntity
}

function localEntitiesToSnapshot(entities: readonly TrackerPhase4bLocalEntity[]): TrackerPhase4bLocalSnapshot {
  const snapshot: TrackerPhase4bLocalSnapshot = {
    studyPlans: [],
    planExecutions: [],
    practiceRecords: [],
    timerRecords: [],
  }
  entities.forEach((entity) => {
    const value = { id: entity.entityId, ...entity.payload, updatedAt: entity.updatedAt }
    if (entity.entityKind === 'study_plan') snapshot.studyPlans.push(value as TrackerPhase4bLocalSnapshot['studyPlans'][number])
    if (entity.entityKind === 'plan_execution') snapshot.planExecutions.push(value as TrackerPhase4bLocalSnapshot['planExecutions'][number])
    if (entity.entityKind === 'practice_record') snapshot.practiceRecords.push(value as TrackerPhase4bLocalSnapshot['practiceRecords'][number])
    if (entity.entityKind === 'timer_record') snapshot.timerRecords.push(value as TrackerPhase4bLocalSnapshot['timerRecords'][number])
  })
  snapshot.studyPlans.sort((a, b) => a.id.localeCompare(b.id))
  snapshot.planExecutions.sort((a, b) => a.id.localeCompare(b.id))
  snapshot.practiceRecords.sort((a, b) => a.id.localeCompare(b.id))
  snapshot.timerRecords.sort((a, b) => a.id.localeCompare(b.id))
  return snapshot
}

function assertRemoteParentIntegrity(entities: readonly TrackerPhase4bRemoteEntity[]): void {
  const livePlanIds = new Set(entities
    .filter((entity) => entity.entityKind === 'study_plan' && entity.deletedAt === null)
    .map((entity) => entity.entityId))
  const orphan = entities.find((entity) => (
    entity.entityKind === 'plan_execution'
    && entity.deletedAt === null
    && entity.payload !== null
    && !livePlanIds.has(entity.payload.planId)
  ))
  if (orphan) throw new Error('Phase 4B cloud snapshot contains an orphan plan execution.')
}

export function reconcileTrackerPhase4bState(input: {
  baseline: readonly TrackerPhase4bRemoteEntity[]
  current: readonly TrackerPhase4bLocalEntity[]
  remote: readonly TrackerPhase4bRemoteEntity[]
  physicallyRemoved?: readonly TrackerPhase4bRemoteEntity[]
  occurredAt: string
  cleanupOperations?: readonly TrackerPhase4bOperationIntent[]
}): ReconciliationResult {
  const baselineByKey = new Map(input.baseline.map((entity) => [entity.semanticKey, entity]))
  const localByKey = new Map(input.current.map((entity) => [entity.semanticKey, entity]))
  const remoteByKey = new Map(input.remote.map((entity) => [entity.semanticKey, entity]))
  const removedKeys = new Set((input.physicallyRemoved ?? []).map((entity) => entity.semanticKey))
  removedKeys.forEach((key) => localByKey.delete(key))
  const operations = [...(input.cleanupOperations ?? [])]
  const restoreRequired: TrackerPhase4bRestoreRequired[] = []
  const keys = new Set([...baselineByKey.keys(), ...localByKey.keys(), ...remoteByKey.keys()])

  for (const key of [...keys].sort()) {
    if (removedKeys.has(key)) continue
    const baseline = baselineByKey.get(key) ?? null
    const local = localByKey.get(key) ?? null
    const remote = remoteByKey.get(key) ?? null
    const plan = planTrackerPhase4bReconciliation({
      baseline,
      local: local
        ? { entity: local }
        : baseline
          ? { entity: null, deletedAt: baseline.deletedAt ?? input.occurredAt }
          : { entity: null },
      remote,
    })
    if (plan.action === 'snapshot_required') {
      throw new Error('Phase 4B incremental baseline is incomplete.')
    }
    if (plan.action === 'upload_upsert' || plan.action === 'upload_delete') {
      if (plan.operation) operations.push(plan.operation)
    }
    if (plan.action === 'install_remote_upsert' || plan.action === 'accept_remote') {
      if (plan.remote?.deletedAt === null) localByKey.set(key, remoteToLocal(plan.remote))
    }
    if (plan.action === 'install_remote_delete') localByKey.delete(key)
    if (plan.action === 'restore_choice') {
      restoreRequired.push({
        entityKind: (local ?? remote ?? baseline)!.entityKind,
        entityId: (remote ?? baseline ?? local)!.entityId,
        reason: 'cloud_tombstone_requires_explicit_restore',
      })
    }
  }
  return {
    snapshot: localEntitiesToSnapshot([...localByKey.values()]),
    operations: sortTrackerPhase4bOperationIntents(operations),
    restoreRequired,
  }
}

function filterQuarantinedDeletes(
  operations: readonly TrackerPhase4bOperationIntent[],
  quarantined: readonly TrackerPhase4bQuarantinedRecord[],
): TrackerPhase4bOperationIntent[] {
  // While any row is unparseable the client cannot prove that a missing valid
  // row is a learner deletion rather than the quarantined source. Upserts stay
  // independent and safe; all deletes wait until the snapshot is fully valid.
  if (quarantined.length > 0) return operations.filter((operation) => operation.action !== 'delete')
  const unknownKinds = new Set(quarantined
    .filter((item) => !item.entityId)
    .map((item) => item.entityKind))
  const known = new Set(quarantined
    .filter((item): item is TrackerPhase4bQuarantinedRecord & { entityId: string } => Boolean(item.entityId))
    .map((item) => `${item.entityKind}\u0000${item.entityId}`))
  return operations.filter((operation) => operation.action !== 'delete' || (
    !unknownKinds.has(operation.entityKind)
    && !known.has(`${operation.entityKind}\u0000${operation.entityId}`)
  ))
}

function operationEnvelopeBytes(input: {
  deviceId: string
  requestId: string
  accountEpoch: number
  operations: readonly TrackerPhase4bSyncOperation[]
}): number {
  return new TextEncoder().encode(JSON.stringify({
    p_device_id: input.deviceId,
    p_request_id: input.requestId,
    p_request_hash: '0'.repeat(64),
    p_account_epoch: input.accountEpoch,
    p_operations: input.operations,
  })).byteLength
}

export class TrackerPhase4bSyncRuntime {
  private readonly options: TrackerPhase4bSyncRuntimeOptions
  private readonly persistence: TrackerPhase4bSyncPersistence
  private readonly rpc: TrackerPhase4bSyncRpc
  private activeFlush: Promise<void> | null = null
  private queued = false
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(options: TrackerPhase4bSyncRuntimeOptions) {
    this.options = options
    this.persistence = options.persistence ?? new BrowserTrackerPhase4bSyncPersistence()
    this.rpc = options.rpc ?? browserTrackerShadowSyncRpc as unknown as TrackerPhase4bSyncRpc
  }

  scheduleFlush(): void {
    const clear = this.options.clearTimer ?? clearTimeout
    const set = this.options.setTimer ?? setTimeout
    if (this.coalesceTimer) clear(this.coalesceTimer)
    this.coalesceTimer = set(() => {
      this.coalesceTimer = null
      void this.flush()
    }, TRACKER_PHASE4B_SYNC_COALESCE_MS)
  }

  dispose(): void {
    this.disposed = true
    this.queued = false
    if (this.coalesceTimer) {
      ;(this.options.clearTimer ?? clearTimeout)(this.coalesceTimer)
      this.coalesceTimer = null
    }
  }

  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.queued = true
    if (this.activeFlush) return this.activeFlush
    this.report({ phase: 'checking', detail: '正在检查学习记录云同步' })
    this.activeFlush = this.drain().finally(() => { this.activeFlush = null })
    return this.activeFlush
  }

  private async drain(): Promise<void> {
    while (this.queued && !this.disposed) {
      this.queued = false
      await this.withLock(() => this.flushOnce())
    }
  }

  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const run = () => {
      const locks = typeof navigator === 'undefined' ? null : navigator.locks as LockManagerLike | undefined
      return locks?.request
        ? locks.request(`tracker-phase4b-sync-v1:${this.options.accountUserId}`, { mode: 'exclusive' }, task)
        : task()
    }
    const queued = localRuntimeQueue.then(run, run)
    localRuntimeQueue = queued.then(() => undefined, () => undefined)
    return queued
  }

  private report(event: TrackerPhase4bSyncStatusEvent): void {
    if (this.disposed) return
    this.options.onStatusChange?.(event)
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Phase 4B sync runtime was disposed.')
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString()
  }

  private createId(): string {
    return (this.options.createId ?? createRuntimeId)()
  }

  private async accessToken(): Promise<string | null> {
    const inspect = this.options.inspectBinding ?? inspectManagedAiDataBinding
    if (inspect(this.options.accountUserId).status !== 'bound') return null
    const identity = await this.rpc.getVerifiedIdentity()
    this.assertActive()
    return identity?.accountUserId === this.options.accountUserId ? identity.accessToken : null
  }

  private async loadState(): Promise<TrackerPhase4bSyncAccountState> {
    const epoch = (this.options.readLocalDataEpoch ?? readCanonicalMutationEpoch)()
    const existing = await this.persistence.load(this.options.accountUserId)
    this.assertActive()
    if (existing?.localDataEpoch === epoch) return existing
    return createTrackerPhase4bSyncAccountState({
      accountUserId: this.options.accountUserId,
      deviceId: this.createId(),
      localDataEpoch: epoch,
      now: this.now(),
    })
  }

  private readLocal() {
    const raw = (this.options.readLocalSnapshot ?? readRawTrackerPhase4bStoreSnapshot)()
    const inspection = inspectTrackerPhase4bLocalSnapshot(raw)
    return {
      ...inspection,
      fingerprint: trackerPhase4bSnapshotFingerprint(inspection.snapshot),
      entities: materializeTrackerPhase4bLocalEntities(inspection.snapshot, this.now()),
    }
  }

  private parseOwnRemote(values: readonly {
    entityKind: string
    entityId: string
    version: number
    cursor: number
    payload: unknown
    deletedAt: string | null
    updatedAt: string
  }[]): TrackerPhase4bRemoteEntity[] {
    return values.flatMap((value) => {
      if (value.entityKind === PREFERENCES_KIND && value.entityId === PREFERENCES_ID) return []
      if (!(TRACKER_PHASE4B_ENTITY_KINDS as readonly string[]).includes(value.entityKind)) {
        throw new Error('Phase 4B cloud response contains an unsupported entity kind.')
      }
      return [parseTrackerPhase4bRemoteEntity(value)]
    })
  }

  private async pullOrSnapshot(
    state: TrackerPhase4bSyncAccountState,
    token: string,
    epoch: number,
  ) {
    try {
      return await this.pull(state, token, epoch)
    } catch (error) {
      const requiresSnapshot = error instanceof TrackerShadowSyncRpcError
        && (
          error.rpcCode === '40001'
          || error.serverMessage === 'TRACKER_SNAPSHOT_REQUIRED'
        )
      if (!requiresSnapshot) throw error
      return this.snapshot(state, token, epoch)
    }
  }

  private async snapshot(
    state: TrackerPhase4bSyncAccountState,
    token: string,
    epoch: number,
  ) {
    const result = parseTrackerSyncSnapshotResult(
      await this.rpc.getSnapshot(token, { deviceId: state.deviceId }),
    )
    this.assertActive()
    if (!result.enabled || result.accountEpoch !== epoch) throw new Error('Phase 4B snapshot epoch mismatch.')
    const merged = mergeTrackerPhase4bRemoteEntityChanges({
      baseline: state.baseline,
      changes: this.parseOwnRemote(result.entities),
      occurredAt: result.generatedAt,
      authoritativeSnapshot: true,
    })
    assertRemoteParentIntegrity(merged.entities)
    state.cursor = result.cursor
    return { ...merged, snapshotHash: result.snapshotHash }
  }

  private async pull(
    state: TrackerPhase4bSyncAccountState,
    token: string,
    epoch: number,
  ) {
    let cursor = state.cursor
    const changes: TrackerPhase4bRemoteEntity[] = []
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const result = parseTrackerSyncPullResult(await this.rpc.pull(token, {
        deviceId: state.deviceId,
        cursor,
        limit: PULL_LIMIT,
      }))
      this.assertActive()
      if (!result.enabled || result.accountEpoch !== epoch || result.nextCursor < cursor) {
        throw new Error('Phase 4B pull epoch or cursor mismatch.')
      }
      changes.push(...this.parseOwnRemote(result.changes))
      cursor = result.nextCursor
      if (!result.hasMore) {
        const merged = mergeTrackerPhase4bRemoteEntityChanges({
          baseline: state.baseline,
          changes,
          occurredAt: this.now(),
        })
        assertRemoteParentIntegrity(merged.entities)
        state.cursor = cursor
        return merged
      }
    }
    throw new Error('Phase 4B pull exceeded its bounded page limit.')
  }

  private async operationSignature(operation: TrackerPhase4bOperationIntent): Promise<string> {
    return trackerSyncSha256({
      entityKind: operation.entityKind,
      entityId: operation.entityId,
      action: operation.action,
      baseVersion: operation.baseVersion,
      payload: operation.payload ?? null,
    })
  }

  private async queueIntents(
    state: TrackerPhase4bSyncAccountState,
    intents: readonly TrackerPhase4bOperationIntent[],
  ): Promise<void> {
    const pending = new Map(state.pendingOperations.map((operation) => [
      operationSemanticKey(operation, state.baseline),
      operation,
    ]))
    for (const intent of sortTrackerPhase4bOperationIntents(intents)) {
      const signature = await this.operationSignature(intent)
      if (state.blockedOperations.some((blocked) => blocked.signature === signature)) continue
      const key = operationSemanticKey(intent as TrackerPhase4bSyncOperation, state.baseline)
      const previous = pending.get(key)
      if (previous?.action === 'upsert' && previous.baseVersion === 0 && intent.action === 'delete') {
        pending.delete(key)
        continue
      }
      pending.set(key, {
        operationId: previous?.operationId ?? this.createId(),
        entityKind: intent.entityKind,
        entityId: intent.entityId,
        action: intent.action,
        localSequence: previous?.localSequence ?? state.nextLocalSequence,
        baseVersion: previous ? Math.min(previous.baseVersion, intent.baseVersion) : intent.baseVersion,
        occurredAt: intent.occurredAt,
        ...(intent.action === 'upsert' ? { payload: intent.payload } : {}),
      })
    }
    state.pendingOperations = [...pending.values()]
  }

  private async sealBatch(
    state: TrackerPhase4bSyncAccountState,
    capabilities: TrackerSyncCapabilities,
  ): Promise<TrackerPhase4bSyncBatch | null> {
    if (state.sealedBatch) return state.sealedBatch
    const ordered = sortTrackerPhase4bOperationIntents(state.pendingOperations) as TrackerPhase4bSyncOperation[]
    if (ordered.length === 0) return null
    const requestId = this.createId()
    const selected: TrackerPhase4bSyncOperation[] = []
    const maximum = Math.min(TRACKER_PHASE4B_MAX_BATCH_OPERATIONS, capabilities.maxBatchSize)
    for (const source of ordered.slice(0, maximum)) {
      const operation = { ...source, localSequence: state.nextLocalSequence + selected.length }
      const candidate = [...selected, operation]
      if (
        operationEnvelopeBytes({
          deviceId: state.deviceId,
          requestId,
          accountEpoch: capabilities.accountEpoch,
          operations: candidate,
        }) > TRACKER_PHASE4B_TARGET_BATCH_BYTES
        || new TextEncoder().encode(JSON.stringify(candidate)).byteLength > capabilities.maxPayloadBytes
      ) {
        if (selected.length === 0) throw new Error('One Phase 4B operation exceeds the batch limit.')
        break
      }
      selected.push(operation)
    }
    const batch: TrackerPhase4bSyncBatch = {
      requestId,
      requestHash: await trackerSyncSha256(selected),
      accountEpoch: capabilities.accountEpoch,
      operations: selected,
      sealedAt: this.now(),
    }
    const selectedIds = new Set(selected.map((operation) => operation.operationId))
    state.pendingOperations = state.pendingOperations.filter((operation) => !selectedIds.has(operation.operationId))
    state.nextLocalSequence += selected.length
    state.sealedBatch = batch
    state.updatedAt = this.now()
    await this.persistence.save(state)
    return batch
  }

  private async reconcileAndInstall(input: {
    state: TrackerPhase4bSyncAccountState
    local: ReturnType<TrackerPhase4bSyncRuntime['readLocal']>
    remote: ReturnType<typeof mergeTrackerPhase4bRemoteEntityChanges>
    authoritative?: boolean
  }): Promise<void> {
    const result = reconcileTrackerPhase4bState({
      baseline: input.state.baseline,
      current: input.local.entities,
      remote: input.remote.entities,
      physicallyRemoved: input.remote.physicallyRemoved,
      occurredAt: this.now(),
      cleanupOperations: input.remote.cleanupOperations,
    })
    input.state.baseline = clone(input.remote.entities)
    input.state.restoreRequired = result.restoreRequired
    const operations = filterQuarantinedDeletes(result.operations, input.local.quarantined)
    if (input.local.quarantined.length === 0) {
      this.assertActive()
      const install = this.options.installLocalSnapshot ?? installTrackerPhase4bStoreSnapshot
      const installed = await install({
        expectedFingerprint: input.local.fingerprint,
        snapshot: result.snapshot,
        occurredAt: this.now(),
        isCurrent: () => !this.disposed,
      })
      this.assertActive()
      if (installed.status === 'stale') {
        input.state.observedFingerprint = null
        this.queued = true
        return
      }
      input.state.observedFingerprint = trackerPhase4bSnapshotFingerprint(result.snapshot)
    } else {
      input.state.observedFingerprint = input.local.fingerprint
    }
    await this.queueIntents(input.state, operations)
  }

  private resetForEpoch(state: TrackerPhase4bSyncAccountState, epoch: number): void {
    state.accountEpoch = epoch
    state.cursor = 0
    state.baselineEstablished = false
    state.baseline = []
    state.observedFingerprint = null
    state.restoreRequired = []
    state.blockedOperations = []
    state.pendingOperations = []
    state.sealedBatch = null
    state.lastSyncedAt = undefined
    state.lastValidation = undefined
  }

  private deferBaselineForQuarantine(state: TrackerPhase4bSyncAccountState): void {
    state.baselineEstablished = false
    state.baseline = []
    state.cursor = 0
    state.observedFingerprint = null
  }

  private async flushOnce(): Promise<void> {
    this.assertActive()
    const token = await this.accessToken()
    if (!token) {
      this.report({ phase: 'paused', detail: '确认当前账号的数据归属后可同步学习记录' })
      return
    }
    const capabilities = parseTrackerSyncCapabilities(await this.rpc.getCapabilities(token))
    this.assertActive()
    const allKindsAllowed = TRACKER_PHASE4B_ENTITY_KINDS.every((kind) => (
      capabilities.allowedEntityKinds.includes(kind)
    ))
    if (!capabilities.enabled || !allKindsAllowed || capabilities.maxBatchSize < 1) {
      this.report({ phase: 'paused', detail: '学习记录云同步暂未开放，本机数据不受影响' })
      return
    }

    const state = await this.loadState()
    this.assertActive()
    if (state.accountEpoch !== null && state.accountEpoch !== capabilities.accountEpoch) {
      this.resetForEpoch(state, capabilities.accountEpoch)
    }
    state.accountEpoch = capabilities.accountEpoch
    const local = this.readLocal()
    this.report({
      phase: 'syncing',
      detail: local.quarantined.length ? '正在同步可用记录，部分本机记录需修复' : '正在同步学习记录',
      quarantinedCount: local.quarantined.length,
    })

    if (!state.baselineEstablished) {
      const remote = await this.snapshot(state, token, capabilities.accountEpoch)
      await this.reconcileAndInstall({ state, local, remote, authoritative: true })
      state.baselineEstablished = true
    } else if (!state.sealedBatch && capabilities.currentCursor > state.cursor) {
      const remote = await this.pullOrSnapshot(state, token, capabilities.accountEpoch)
      await this.reconcileAndInstall({ state, local, remote })
    } else if (!state.sealedBatch && state.observedFingerprint !== local.fingerprint) {
      const diff = diffTrackerPhase4bLocalEntities(state.baseline, local.entities, this.now())
      state.restoreRequired = diff.restoreRequired
      await this.queueIntents(state, filterQuarantinedDeletes(diff.operations, local.quarantined))
      state.observedFingerprint = local.fingerprint
    }

    const batch = await this.sealBatch(state, capabilities)
    this.assertActive()
    if (!batch) {
      const syncedAt = this.now()
      state.lastSyncedAt = syncedAt
      state.updatedAt = syncedAt
      if (local.quarantined.length > 0) this.deferBaselineForQuarantine(state)
      await this.persistence.save(state)
      const isPartial = local.quarantined.length > 0 || state.restoreRequired.length > 0
      this.report({
        phase: isPartial ? 'partial' : 'synced',
        lastSyncedAt: syncedAt,
        detail: local.quarantined.length
          ? '可用的新增与修改已同步；删除会在异常记录修复后补传'
          : state.restoreRequired.length
            ? '其余记录已同步；云端已删除的记录暂留本机等待后续确认'
            : '学习记录已同步',
        quarantinedCount: local.quarantined.length,
        restoreRequired: state.restoreRequired,
      })
      return
    }

    const apply = parseTrackerSyncApplyResult(await this.rpc.applyBatch(token, {
      deviceId: state.deviceId,
      requestId: batch.requestId,
      requestHash: batch.requestHash,
      accountEpoch: batch.accountEpoch,
      operations: batch.operations,
    }))
    this.assertActive()
    if (apply.requestId !== batch.requestId || apply.requestHash !== batch.requestHash) {
      throw new Error('Phase 4B apply receipt does not match the sealed request.')
    }
    if (apply.status === 'disabled') {
      this.report({ phase: 'paused', detail: '云同步已暂停，本机修改仍已保存' })
      return
    }
    if (apply.status === 'epoch_mismatch') {
      this.resetForEpoch(state, apply.accountEpoch)
      await this.persistence.save(state)
      this.queued = true
      return
    }
    if (apply.status === 'snapshot_required') {
      state.sealedBatch = null
      const remote = await this.snapshot(state, token, apply.accountEpoch)
      await this.reconcileAndInstall({ state, local: this.readLocal(), remote, authoritative: true })
      state.baselineEstablished = true
      await this.persistence.save(state)
      this.queued = true
      return
    }

    const byId = new Map(apply.results.map((result) => [result.operationId, result]))
    if (batch.operations.some((operation) => !byId.has(operation.operationId))) {
      throw new Error('Phase 4B apply receipt omitted an operation result.')
    }
    const rejected: TrackerPhase4bBlockedOperation[] = []
    for (const operation of batch.operations) {
      const result = byId.get(operation.operationId)!
      if (result.status === 'rejected') {
        rejected.push({
          entityKind: operation.entityKind,
          entityId: operation.entityId,
          signature: await this.operationSignature(operation),
          reason: result.reason ?? 'server rejected the operation',
          blockedAt: this.now(),
        })
      }
    }
    state.blockedOperations = [
      ...state.blockedOperations.filter((blocked) => !rejected.some((item) => (
        item.entityKind === blocked.entityKind && item.entityId === blocked.entityId
      ))),
      ...rejected,
    ].slice(-5_000)
    state.sealedBatch = null
    // The server has durably accepted this idempotent request. Checkpoint that
    // fact before the follow-up pull/local install so a transient validation
    // failure cannot keep replaying the old batch and starve newer mutations.
    state.updatedAt = this.now()
    await this.persistence.save(state)
    this.assertActive()
    const remote = await this.pullOrSnapshot(state, token, apply.accountEpoch)
    this.assertActive()
    const latestLocal = this.readLocal()
    await this.reconcileAndInstall({ state, local: latestLocal, remote })
    const rejectedSignatures = new Set(rejected.map((item) => item.signature))
    state.pendingOperations = (await Promise.all(state.pendingOperations.map(async (operation) => ({
      operation,
      signature: await this.operationSignature(operation),
    })))).filter((item) => !rejectedSignatures.has(item.signature)).map((item) => item.operation)
    const syncedAt = this.now()
    state.lastSyncedAt = syncedAt
    state.updatedAt = syncedAt
    state.lastValidation = {
      requestId: batch.requestId,
      requestStatus: apply.status,
      cursor: state.cursor,
      snapshotHash: `incremental:${state.cursor}`,
      remoteEntityCount: state.baseline.length,
      validatedAt: syncedAt,
    }
    if (latestLocal.quarantined.length > 0) this.deferBaselineForQuarantine(state)
    await this.persistence.save(state)
    const hasPartial = rejected.length > 0
      || latestLocal.quarantined.length > 0
      || state.restoreRequired.length > 0
    this.report({
      phase: hasPartial ? 'partial' : 'synced',
      lastSyncedAt: syncedAt,
      detail: rejected.length
        ? '部分记录被云端拒绝，已保留在本机且不会自动重复提交'
        : latestLocal.quarantined.length
          ? '可用的新增与修改已同步；删除会在异常记录修复后补传'
          : state.restoreRequired.length
            ? '其余记录已同步；云端已删除的记录暂留本机等待后续确认'
          : '学习记录已同步',
      quarantinedCount: latestLocal.quarantined.length,
      restoreRequired: state.restoreRequired,
    })
    if (state.pendingOperations.length > 0 && rejected.length === 0) this.queued = true
  }
}

export const trackerPhase4bRuntimeInternals = {
  filterQuarantinedDeletes,
  operationEnvelopeBytes,
  assertRemoteParentIntegrity,
}
