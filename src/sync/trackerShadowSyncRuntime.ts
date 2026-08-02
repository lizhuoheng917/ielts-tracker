import { inspectManagedAiDataBinding } from '@/auth/managedAiDataBinding'
import {
  readCanonicalMutationEpoch,
} from '@/data/canonicalMutationCoordinator'
import {
  BrowserTrackerShadowSyncPersistence,
  createTrackerShadowSyncAccountState,
  type TrackerShadowSyncAccountState,
  type TrackerShadowSyncPersistence,
} from '@/sync/trackerShadowSyncPersistence'
import {
  assertShadowRemoteEntity,
  parseTrackerSyncApplyResult,
  parseTrackerSyncCapabilities,
  parseTrackerSyncPullResult,
  parseTrackerSyncSnapshotResult,
  TRACKER_SHADOW_SYNC_ENTITY_ID,
  TRACKER_SHADOW_SYNC_ENTITY_KIND,
  trackerSyncSha256,
  type TrackerShadowSyncBatch,
  type TrackerShadowSyncOperation,
  type TrackerSyncCapabilities,
} from '@/sync/trackerShadowSyncProtocol'
import {
  browserTrackerShadowSyncRpc,
  type TrackerShadowSyncRpc,
} from '@/sync/trackerShadowSyncRpc'

const PULL_LIMIT = 100
const MAX_PULL_PAGES = 10

interface TrackerShadowSyncRuntimeOptions {
  accountUserId: string
  persistence?: TrackerShadowSyncPersistence
  rpc?: TrackerShadowSyncRpc
  inspectBinding?: (accountUserId: string) => { status: string }
  readLocalDataEpoch?: () => string
  withMutationLock?: <T>(task: () => Promise<T>) => Promise<T>
  now?: () => Date
  createId?: () => string
}

interface ShadowLockManager {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => T | PromiseLike<T>,
  ): Promise<T>
}

let localShadowQueue: Promise<void> = Promise.resolve()

function withTrackerShadowSyncLock<T>(
  accountUserId: string,
  task: () => Promise<T>,
): Promise<T> {
  const run = () => {
    const locks = typeof navigator === 'undefined'
      ? null
      : navigator.locks as ShadowLockManager | undefined
    return locks && typeof locks.request === 'function'
      ? locks.request(`tracker-shadow-sync-v1:${accountUserId}`, { mode: 'exclusive' }, task)
      : task()
  }
  const queued = localShadowQueue.then(run, run)
  localShadowQueue = queued.then(() => undefined, () => undefined)
  return queued
}

function createRuntimeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizedExamDate(value: string | undefined): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Local examDate is invalid.')
  }
  return value
}

function operationBytes(operations: readonly TrackerShadowSyncOperation[]): number {
  return new TextEncoder().encode(JSON.stringify(operations)).byteLength
}

export class TrackerShadowSyncRuntime {
  private readonly accountUserId: string
  private readonly persistence: TrackerShadowSyncPersistence
  private readonly rpc: TrackerShadowSyncRpc
  private readonly inspectBinding: (accountUserId: string) => { status: string }
  private readonly readLocalDataEpoch: () => string
  private readonly withMutationLock: <T>(task: () => Promise<T>) => Promise<T>
  private readonly now: () => Date
  private readonly createId: () => string
  private activeFlush: Promise<void> | null = null
  private queuedFlush: { examDate: string | undefined } | null = null

  constructor(options: TrackerShadowSyncRuntimeOptions) {
    this.accountUserId = options.accountUserId
    this.persistence = options.persistence ?? new BrowserTrackerShadowSyncPersistence()
    this.rpc = options.rpc ?? browserTrackerShadowSyncRpc
    this.inspectBinding = options.inspectBinding ?? inspectManagedAiDataBinding
    this.readLocalDataEpoch = options.readLocalDataEpoch ?? (() => readCanonicalMutationEpoch())
    // Shadow sync owns a separate lock so a slow network can never block the
    // learner's import, clear-data or ordinary local save path.
    this.withMutationLock = options.withMutationLock ?? ((task) => withTrackerShadowSyncLock(this.accountUserId, task))
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? createRuntimeId
  }

  flush(localExamDate: string | undefined): Promise<void> {
    this.queuedFlush = { examDate: localExamDate }
    if (this.activeFlush) return this.activeFlush
    this.activeFlush = this.drainQueuedFlushes().finally(() => {
      this.activeFlush = null
    })
    return this.activeFlush
  }

  private async drainQueuedFlushes(): Promise<void> {
    while (this.queuedFlush) {
      const request = this.queuedFlush
      this.queuedFlush = null
      await this.flushOnce(request.examDate)
    }
  }

  private async verifiedAccessToken(): Promise<string | null> {
    if (this.inspectBinding(this.accountUserId).status !== 'bound') return null
    const identity = await this.rpc.getVerifiedIdentity()
    if (!identity || identity.accountUserId !== this.accountUserId) return null
    return identity.accessToken
  }

  private async loadState(): Promise<TrackerShadowSyncAccountState> {
    const localDataEpoch = this.readLocalDataEpoch()
    const existing = await this.persistence.load(this.accountUserId)
    if (existing && existing.localDataEpoch === localDataEpoch) return existing
    return createTrackerShadowSyncAccountState({
      accountUserId: this.accountUserId,
      deviceId: this.createId(),
      localDataEpoch,
      now: this.now().toISOString(),
    })
  }

  private captureExamDate(
    state: TrackerShadowSyncAccountState,
    localExamDate: string | undefined,
  ): void {
    const examDate = normalizedExamDate(localExamDate)
    if (state.hasObservedExamDate && state.observedExamDate === examDate) return

    const operation: TrackerShadowSyncOperation = {
      operationId: this.createId(),
      entityKind: TRACKER_SHADOW_SYNC_ENTITY_KIND,
      entityId: TRACKER_SHADOW_SYNC_ENTITY_ID,
      action: 'upsert',
      localSequence: state.nextLocalSequence,
      baseVersion: state.remoteVersion,
      occurredAt: this.now().toISOString(),
      payload: { examDate },
    }
    state.nextLocalSequence += 1
    state.hasObservedExamDate = true
    state.observedExamDate = examDate
    // Only one entity participates in the pilot. A change made while an older
    // request is sealed waits as the single next operation.
    state.pendingOperations = [operation]
    state.updatedAt = this.now().toISOString()
  }

  private async sealBatch(
    state: TrackerShadowSyncAccountState,
    capabilities: TrackerSyncCapabilities,
  ): Promise<TrackerShadowSyncBatch | null> {
    if (state.sealedBatch) return state.sealedBatch
    const operations = state.pendingOperations.slice(0, Math.max(1, capabilities.maxBatchSize))
    if (operations.length === 0) return null
    if (operationBytes(operations) > capabilities.maxPayloadBytes) {
      throw new Error('Tracker shadow sync payload exceeds the server capability.')
    }
    const batch: TrackerShadowSyncBatch = {
      requestId: this.createId(),
      requestHash: await trackerSyncSha256(operations),
      accountEpoch: capabilities.accountEpoch,
      operations: JSON.parse(JSON.stringify(operations)) as TrackerShadowSyncOperation[],
      sealedAt: this.now().toISOString(),
    }
    state.sealedBatch = batch
    state.pendingOperations = state.pendingOperations.slice(operations.length)
    state.updatedAt = this.now().toISOString()
    await this.persistence.save(state)
    return batch
  }

  private validateCapabilities(capabilities: TrackerSyncCapabilities): boolean {
    return capabilities.enabled
      && capabilities.allowedEntityKinds.includes(TRACKER_SHADOW_SYNC_ENTITY_KIND)
      && capabilities.maxBatchSize >= 1
      && capabilities.maxPayloadBytes > 0
  }

  private async validatePull(
    state: TrackerShadowSyncAccountState,
    accessToken: string,
    accountEpoch: number,
  ): Promise<void> {
    let cursor = state.cursor
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const pull = parseTrackerSyncPullResult(await this.rpc.pull(accessToken, {
        deviceId: state.deviceId,
        cursor,
        limit: PULL_LIMIT,
      }))
      if (!pull.enabled || pull.accountEpoch !== accountEpoch || pull.nextCursor < cursor) {
        throw new Error('Tracker shadow pull did not match the sealed account epoch.')
      }
      pull.changes.forEach((change) => {
        assertShadowRemoteEntity(change)
        state.remoteVersion = Math.max(state.remoteVersion, change.version)
      })
      cursor = pull.nextCursor
      if (!pull.hasMore) {
        state.cursor = Math.max(state.cursor, cursor)
        return
      }
    }
    throw new Error('Tracker shadow pull exceeded its bounded page limit.')
  }

  private async validateSnapshot(
    state: TrackerShadowSyncAccountState,
    accessToken: string,
    accountEpoch: number,
  ) {
    const snapshot = parseTrackerSyncSnapshotResult(
      await this.rpc.getSnapshot(accessToken, { deviceId: state.deviceId }),
    )
    if (!snapshot.enabled || snapshot.accountEpoch !== accountEpoch) {
      throw new Error('Tracker shadow snapshot did not match the sealed account epoch.')
    }
    snapshot.entities.forEach((entity) => {
      assertShadowRemoteEntity(entity)
      state.remoteVersion = Math.max(state.remoteVersion, entity.version)
    })
    state.cursor = Math.max(state.cursor, snapshot.cursor)
    return snapshot
  }

  private async flushOnce(localExamDate: string | undefined): Promise<void> {
    const accessToken = await this.verifiedAccessToken()
    if (!accessToken) return
    const capabilities = parseTrackerSyncCapabilities(
      await this.rpc.getCapabilities(accessToken),
    )
    if (!this.validateCapabilities(capabilities)) return

    await this.withMutationLock(async () => {
      const state = await this.loadState()
      if (state.accountEpoch !== null && state.accountEpoch !== capabilities.accountEpoch) {
        if (state.sealedBatch) {
          state.pendingOperations = [
            ...state.sealedBatch.operations,
            ...state.pendingOperations,
          ].slice(-1)
          state.sealedBatch = null
        }
        state.cursor = 0
        state.remoteVersion = 0
      }
      state.accountEpoch = capabilities.accountEpoch
      this.captureExamDate(state, localExamDate)
      await this.persistence.save(state)

      const batch = await this.sealBatch(state, capabilities)
      if (!batch) {
        if (capabilities.currentCursor > state.cursor) {
          await this.validateSnapshot(state, accessToken, capabilities.accountEpoch)
          state.updatedAt = this.now().toISOString()
          await this.persistence.save(state)
        }
        return
      }
      const apply = parseTrackerSyncApplyResult(await this.rpc.applyBatch(accessToken, {
        deviceId: state.deviceId,
        requestId: batch.requestId,
        requestHash: batch.requestHash,
        accountEpoch: batch.accountEpoch,
        operations: batch.operations,
      }))
      if (apply.requestId !== batch.requestId || apply.requestHash !== batch.requestHash) {
        throw new Error('Tracker shadow sync receipt does not match the sealed request.')
      }
      if (apply.status === 'disabled') return
      if (apply.status === 'epoch_mismatch') {
        state.pendingOperations = [...batch.operations, ...state.pendingOperations].slice(-1)
        state.sealedBatch = null
        state.accountEpoch = apply.accountEpoch
        state.cursor = 0
        state.remoteVersion = 0
        state.updatedAt = this.now().toISOString()
        await this.persistence.save(state)
        return
      }
      if (apply.status === 'snapshot_required') {
        await this.validateSnapshot(state, accessToken, apply.accountEpoch)
        const latest = batch.operations.at(-1)
        state.sealedBatch = null
        state.accountEpoch = apply.accountEpoch
        state.pendingOperations = latest ? [{
          ...latest,
          operationId: this.createId(),
          localSequence: state.nextLocalSequence,
          baseVersion: state.remoteVersion,
          occurredAt: this.now().toISOString(),
        }] : []
        if (latest) state.nextLocalSequence += 1
        state.updatedAt = this.now().toISOString()
        await this.persistence.save(state)
        return
      }
      const matchingResults = new Map(apply.results.map((result) => [result.operationId, result]))
      const rejected = batch.operations.some((operation) => {
        const result = matchingResults.get(operation.operationId)
        return !result || result.status === 'rejected'
      })
      if (rejected) throw new Error('Tracker shadow sync operation was rejected.')
      apply.results.forEach((result) => {
        state.remoteVersion = Math.max(state.remoteVersion, result.version)
      })

      await this.validatePull(state, accessToken, batch.accountEpoch)
      const snapshot = await this.validateSnapshot(state, accessToken, batch.accountEpoch)
      state.sealedBatch = null
      state.accountEpoch = apply.accountEpoch
      state.cursor = Math.max(state.cursor, apply.cursor)
      state.lastValidation = {
        requestId: batch.requestId,
        requestStatus: apply.status,
        cursor: state.cursor,
        snapshotHash: snapshot.snapshotHash,
        remoteEntityCount: snapshot.entities.length,
        validatedAt: this.now().toISOString(),
      }
      state.updatedAt = this.now().toISOString()
      await this.persistence.save(state)
    })
  }
}
