import { inspectManagedAiDataBinding } from '@/auth/managedAiDataBinding'
import { isLocalDate } from '@/lib/localDate'
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
  type TrackerSyncPullResult,
  type TrackerSyncSnapshotResult,
} from '@/sync/trackerShadowSyncProtocol'
import {
  browserTrackerShadowSyncRpc,
  TrackerShadowSyncRpcError,
  type TrackerShadowSyncRpc,
} from '@/sync/trackerShadowSyncRpc'

const PULL_LIMIT = 100
const MAX_PULL_PAGES = 10

export interface TrackerShadowSyncStatusEvent {
  phase: 'checking' | 'syncing' | 'synced' | 'paused' | 'needs_choice'
  lastSyncedAt?: string
  detail?: string
  conflict?: { localExamDate: string | null; remoteExamDate: string | null }
}

interface TrackerShadowSyncRuntimeOptions {
  accountUserId: string
  persistence?: TrackerShadowSyncPersistence
  rpc?: TrackerShadowSyncRpc
  inspectBinding?: (accountUserId: string) => { status: string }
  readLocalDataEpoch?: () => string
  readLocalExamDate?: () => string | null
  withMutationLock?: <T>(task: () => Promise<T>) => Promise<T>
  installRemoteExamDate?: (remoteExamDate: string | null, expectedLocalExamDate: string | null) => string | null
  onStatusChange?: (status: TrackerShadowSyncStatusEvent) => void
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
  if (!isLocalDate(value)) {
    throw new Error('Local examDate is invalid.')
  }
  return value
}

function operationBytes(operations: readonly TrackerShadowSyncOperation[]): number {
  return new TextEncoder().encode(JSON.stringify(operations)).byteLength
}

function snapshotExamDate(snapshot: TrackerSyncSnapshotResult): {
  exists: boolean
  examDate: string | null
} {
  const entity = snapshot.entities
    .filter((candidate) => (
      candidate.entityKind === TRACKER_SHADOW_SYNC_ENTITY_KIND
      && candidate.entityId === TRACKER_SHADOW_SYNC_ENTITY_ID
    ))
    .sort((left, right) => right.version - left.version)[0]
  if (!entity || entity.deletedAt !== null) return { exists: false, examDate: null }
  return { exists: true, examDate: remoteEntityExamDate(entity) }
}

function remoteEntityExamDate(
  entity: TrackerSyncPullResult['changes'][number],
): string | null {
  assertShadowRemoteEntity(entity)
  if (entity.deletedAt !== null) return null
  const payload = entity.payload as { examDate?: string | null }
  return payload.examDate ?? null
}

function requiresFullSnapshot(error: unknown): boolean {
  return error instanceof TrackerShadowSyncRpcError
    && (
      error.rpcCode === '40001'
      || error.serverMessage === 'TRACKER_SNAPSHOT_REQUIRED'
    )
}

export class TrackerShadowSyncRuntime {
  private readonly accountUserId: string
  private readonly persistence: TrackerShadowSyncPersistence
  private readonly rpc: TrackerShadowSyncRpc
  private readonly inspectBinding: (accountUserId: string) => { status: string }
  private readonly readLocalDataEpoch: () => string
  private readonly readLocalExamDate?: TrackerShadowSyncRuntimeOptions['readLocalExamDate']
  private readonly withMutationLock: <T>(task: () => Promise<T>) => Promise<T>
  private readonly installRemoteExamDate?: TrackerShadowSyncRuntimeOptions['installRemoteExamDate']
  private readonly onStatusChange?: TrackerShadowSyncRuntimeOptions['onStatusChange']
  private readonly now: () => Date
  private readonly createId: () => string
  private activeFlush: Promise<void> | null = null
  private queuedFlush: { examDate: string | undefined } | null = null
  private disposed = false

  constructor(options: TrackerShadowSyncRuntimeOptions) {
    this.accountUserId = options.accountUserId
    this.persistence = options.persistence ?? new BrowserTrackerShadowSyncPersistence()
    this.rpc = options.rpc ?? browserTrackerShadowSyncRpc
    this.inspectBinding = options.inspectBinding ?? inspectManagedAiDataBinding
    this.readLocalDataEpoch = options.readLocalDataEpoch ?? (() => readCanonicalMutationEpoch())
    this.readLocalExamDate = options.readLocalExamDate
    // Shadow sync owns a separate lock so a slow network can never block the
    // learner's import, clear-data or ordinary local save path.
    this.withMutationLock = options.withMutationLock ?? ((task) => withTrackerShadowSyncLock(this.accountUserId, task))
    this.installRemoteExamDate = options.installRemoteExamDate
    this.onStatusChange = options.onStatusChange
    this.now = options.now ?? (() => new Date())
    this.createId = options.createId ?? createRuntimeId
  }

  flush(localExamDate: string | undefined): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.queuedFlush = { examDate: localExamDate }
    if (this.activeFlush) return this.activeFlush
    this.reportStatus({ phase: 'checking', detail: '正在检查考试日期云同步' })
    this.activeFlush = this.drainQueuedFlushes()
      .catch((error) => {
        throw error
      })
      .finally(() => {
        this.activeFlush = null
      })
    return this.activeFlush
  }

  private reportStatus(status: TrackerShadowSyncStatusEvent): void {
    if (this.disposed) return
    this.onStatusChange?.(status)
  }

  dispose(): void {
    this.disposed = true
    this.queuedFlush = null
  }

  async resolveBaselineConflict(choice: 'local' | 'remote'): Promise<void> {
    if (this.disposed) return
    this.reportStatus({ phase: 'syncing', detail: '正在应用你选择的考试日期' })
    let nextFlushValue: string | null | undefined
    await this.withMutationLock(async () => {
      const state = await this.loadState()
      const conflict = state.baselineConflict
      if (!conflict) return

      if (choice === 'local') {
        state.baselineEstablished = true
        state.baselineConflict = undefined
        state.hasObservedExamDate = true
        state.observedExamDate = conflict.localExamDate
        this.queueExamDate(state, conflict.localExamDate)
        await this.persistence.save(state)
        nextFlushValue = conflict.localExamDate
        return
      }

      await this.rememberRemoteExamDate(
        state,
        conflict.remoteExamDate,
        this.readLocalExamDate?.() ?? conflict.localExamDate,
        true,
      )
      const pending = state.pendingOperations.at(-1)
      nextFlushValue = pending?.payload.examDate
    })

    if (nextFlushValue !== undefined) {
      await this.flush(nextFlushValue ?? undefined)
      return
    }
    this.reportStatus({
      phase: 'synced',
      lastSyncedAt: this.now().toISOString(),
      detail: '已采用云端考试日期',
    })
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
    if (this.disposed) return null
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

    this.queueExamDate(state, examDate)
  }

  private queueExamDate(
    state: TrackerShadowSyncAccountState,
    examDate: string | null,
  ): void {
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

  private async rememberRemoteExamDate(
    state: TrackerShadowSyncAccountState,
    remoteExamDate: string | null,
    expectedLocalExamDate: string | null,
    installVisibleValue: boolean,
  ): Promise<boolean> {
    const syncedAt = this.now().toISOString()
    state.baselineEstablished = true
    state.baselineConflict = undefined
    state.lastSyncedExamDate = remoteExamDate
    state.lastSyncedAt = syncedAt
    state.hasObservedExamDate = true
    state.observedExamDate = installVisibleValue ? remoteExamDate : expectedLocalExamDate
    state.updatedAt = syncedAt

    // Persist the echo-suppression baseline before mutating Zustand. Its
    // subscription may schedule another flush synchronously.
    await this.persistence.save(state)
    if (!installVisibleValue || !this.installRemoteExamDate) return false
    if (this.disposed) return false

    const actualLocalExamDate = this.installRemoteExamDate(remoteExamDate, expectedLocalExamDate)
    if (actualLocalExamDate === remoteExamDate) return true

    // A learner changed the date while the request was in flight. Preserve that
    // newer local edit and queue it against the just-observed cloud version.
    state.observedExamDate = remoteExamDate
    this.queueExamDate(state, actualLocalExamDate)
    await this.persistence.save(state)
    return false
  }

  private async rememberConflict(
    state: TrackerShadowSyncAccountState,
    localExamDate: string | null,
    remoteExamDate: string | null,
  ): Promise<void> {
    const syncedAt = this.now().toISOString()
    state.baselineEstablished = true
    state.baselineConflict = { localExamDate, remoteExamDate }
    state.lastSyncedExamDate = remoteExamDate
    state.lastSyncedAt = syncedAt
    state.hasObservedExamDate = true
    state.observedExamDate = localExamDate
    state.pendingOperations = []
    state.sealedBatch = null
    state.updatedAt = syncedAt
    await this.persistence.save(state)
    this.reportStatus({
      phase: 'needs_choice',
      detail: '本机与云端的考试日期不同，请选择保留哪一个',
      conflict: state.baselineConflict,
    })
  }

  private async mergeEstablishedBaseline(
    state: TrackerShadowSyncAccountState,
    localExamDate: string | null,
    remoteExamDate: string | null,
  ): Promise<'conflict' | 'pending' | 'installed' | 'unchanged'> {
    const baselineExamDate = state.lastSyncedExamDate
    if (localExamDate === remoteExamDate) {
      await this.rememberRemoteExamDate(state, remoteExamDate, localExamDate, false)
      return 'unchanged'
    }

    const localChanged = localExamDate !== baselineExamDate
    const remoteChanged = remoteExamDate !== baselineExamDate
    if (localChanged && remoteChanged) {
      await this.rememberConflict(state, localExamDate, remoteExamDate)
      return 'conflict'
    }
    if (remoteChanged) {
      await this.rememberRemoteExamDate(state, remoteExamDate, localExamDate, true)
      return 'installed'
    }
    if (localChanged) {
      this.queueExamDate(state, localExamDate)
      await this.persistence.save(state)
      return 'pending'
    }

    throw new Error('Tracker exam-date merge reached an inconsistent state.')
  }

  private async establishBaseline(
    state: TrackerShadowSyncAccountState,
    accessToken: string,
    accountEpoch: number,
    localExamDate: string | undefined,
  ): Promise<void> {
    this.reportStatus({ phase: 'syncing', detail: '正在建立考试日期同步基线' })
    const localValue = normalizedExamDate(localExamDate)
    const snapshot = await this.validateSnapshot(state, accessToken, accountEpoch)
    const remote = snapshotExamDate(snapshot)

    if (localValue === null) {
      await this.rememberRemoteExamDate(
        state,
        remote.examDate,
        localValue,
        remote.exists && remote.examDate !== null,
      )
      return
    }

    if (remote.exists && remote.examDate !== localValue) {
      await this.rememberConflict(state, localValue, remote.examDate)
      return
    }

    await this.rememberRemoteExamDate(state, remote.examDate, localValue, false)
    if (!remote.exists || remote.examDate !== localValue) {
      this.queueExamDate(state, localValue)
      await this.persistence.save(state)
    }
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
  ): Promise<{ changed: boolean; examDate: string | null }> {
    let cursor = state.cursor
    let latestPreference: TrackerSyncPullResult['changes'][number] | null = null
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
        // The backend cursor is shared by every Tracker entity kind. This
        // runtime owns only the preferences row; Phase 4B records are parsed
        // and installed by their independent runtime.
        if (
          change.entityKind !== TRACKER_SHADOW_SYNC_ENTITY_KIND
          || change.entityId !== TRACKER_SHADOW_SYNC_ENTITY_ID
        ) return
        assertShadowRemoteEntity(change)
        state.remoteVersion = Math.max(state.remoteVersion, change.version)
        if (
          !latestPreference
          || change.cursor > latestPreference.cursor
          || (
            change.cursor === latestPreference.cursor
            && change.version > latestPreference.version
          )
        ) latestPreference = change
      })
      cursor = pull.nextCursor
      if (!pull.hasMore) {
        state.cursor = Math.max(state.cursor, cursor)
        return latestPreference
          ? { changed: true, examDate: remoteEntityExamDate(latestPreference) }
          : { changed: false, examDate: null }
      }
    }
    throw new Error('Tracker shadow pull exceeded its bounded page limit.')
  }

  private async pullExamDateOrSnapshot(
    state: TrackerShadowSyncAccountState,
    accessToken: string,
    accountEpoch: number,
  ): Promise<{ changed: boolean; examDate: string | null }> {
    try {
      return await this.validatePull(state, accessToken, accountEpoch)
    } catch (error) {
      if (!requiresFullSnapshot(error)) throw error
      const snapshot = await this.validateSnapshot(state, accessToken, accountEpoch)
      return { changed: true, examDate: snapshotExamDate(snapshot).examDate }
    }
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
      if (
        entity.entityKind !== TRACKER_SHADOW_SYNC_ENTITY_KIND
        || entity.entityId !== TRACKER_SHADOW_SYNC_ENTITY_ID
      ) return
      assertShadowRemoteEntity(entity)
      state.remoteVersion = Math.max(state.remoteVersion, entity.version)
    })
    state.cursor = Math.max(state.cursor, snapshot.cursor)
    return snapshot
  }

  private async flushOnce(localExamDate: string | undefined): Promise<void> {
    if (this.disposed) return
    const accessToken = await this.verifiedAccessToken()
    if (!accessToken) {
      this.reportStatus({ phase: 'paused', detail: '确认当前账号的数据归属后可同步' })
      return
    }
    const capabilities = parseTrackerSyncCapabilities(
      await this.rpc.getCapabilities(accessToken),
    )
    if (this.disposed) return
    if (!this.validateCapabilities(capabilities)) {
      this.reportStatus({ phase: 'paused', detail: '云同步暂未开放，本机数据不受影响' })
      return
    }

    await this.withMutationLock(async () => {
      const state = await this.loadState()
      if (state.accountEpoch !== null && state.accountEpoch !== capabilities.accountEpoch) {
        state.pendingOperations = []
        state.sealedBatch = null
        state.cursor = 0
        state.remoteVersion = 0
        state.baselineEstablished = false
        state.baselineConflict = undefined
        state.lastSyncedExamDate = null
        state.lastSyncedAt = undefined
        state.hasObservedExamDate = false
        state.observedExamDate = null
      }
      state.accountEpoch = capabilities.accountEpoch
      if (state.baselineConflict) {
        const latestLocalExamDate = normalizedExamDate(localExamDate)
        if (state.baselineConflict.localExamDate !== latestLocalExamDate) {
          state.baselineConflict.localExamDate = latestLocalExamDate
          state.observedExamDate = latestLocalExamDate
          state.updatedAt = this.now().toISOString()
          await this.persistence.save(state)
        }
        this.reportStatus({
          phase: 'needs_choice',
          detail: '本机与云端的考试日期不同，请选择保留哪一个',
          conflict: state.baselineConflict,
        })
        return
      }

      if (!state.baselineEstablished) {
        await this.establishBaseline(
          state,
          accessToken,
          capabilities.accountEpoch,
          localExamDate,
        )
      } else if (state.sealedBatch) {
        // A sealed request may already have committed even if its response was
        // lost. Replay it byte-for-byte before observing newer remote state.
      } else if (capabilities.currentCursor > state.cursor) {
        this.reportStatus({ phase: 'syncing', detail: '正在合并另一台设备的考试日期' })
        const remote = await this.pullExamDateOrSnapshot(
          state,
          accessToken,
          capabilities.accountEpoch,
        )
        if (remote.changed) {
          await this.mergeEstablishedBaseline(
            state,
            normalizedExamDate(localExamDate),
            remote.examDate,
          )
        } else {
          // The account cursor is shared with Phase 4B learning records. When
          // only those rows changed, advance this stream without re-reading or
          // rewriting the independent exam-date value.
          this.captureExamDate(state, localExamDate)
          await this.persistence.save(state)
        }
      } else {
        this.captureExamDate(state, localExamDate)
        await this.persistence.save(state)
      }

      if (state.baselineConflict) {
        this.reportStatus({
          phase: 'needs_choice',
          detail: '本机与云端的考试日期不同，请选择保留哪一个',
          conflict: state.baselineConflict,
        })
        return
      }

      const batch = await this.sealBatch(state, capabilities)
      if (!batch) {
        if (capabilities.currentCursor > state.cursor) {
          this.reportStatus({ phase: 'syncing', detail: '正在接收另一台设备的考试日期' })
          const remote = await this.pullExamDateOrSnapshot(
            state,
            accessToken,
            capabilities.accountEpoch,
          )
          if (remote.changed) {
            await this.mergeEstablishedBaseline(
              state,
              normalizedExamDate(localExamDate),
              remote.examDate,
            )
          } else {
            await this.persistence.save(state)
          }
          if (state.baselineConflict) return
          if (state.pendingOperations.length > 0) {
            this.reportStatus({ phase: 'syncing', detail: '本机有更新，等待下一次同步' })
            return
          }
        }
        this.reportStatus({
          phase: 'synced',
          lastSyncedAt: state.lastSyncedAt ?? this.now().toISOString(),
          detail: '考试日期已与云端保持一致',
        })
        return
      }
      this.reportStatus({ phase: 'syncing', detail: '正在保存考试日期' })
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
      if (apply.status === 'disabled') {
        this.reportStatus({ phase: 'paused', detail: '云同步已暂停，本机修改仍已保存' })
        return
      }
      if (apply.status === 'epoch_mismatch') {
        // The visible local setting remains canonical. Drop transport objects
        // tied to the old epoch and rebuild them after a fresh snapshot.
        state.pendingOperations = []
        state.sealedBatch = null
        state.accountEpoch = apply.accountEpoch
        state.cursor = 0
        state.remoteVersion = 0
        state.baselineEstablished = false
        state.baselineConflict = undefined
        state.lastSyncedExamDate = null
        state.lastSyncedAt = undefined
        state.hasObservedExamDate = false
        state.observedExamDate = null
        state.updatedAt = this.now().toISOString()
        await this.persistence.save(state)
        this.reportStatus({ phase: 'syncing', detail: '云端版本已变化，等待重新同步' })
        return
      }
      if (apply.status === 'snapshot_required') {
        const snapshot = await this.validateSnapshot(state, accessToken, apply.accountEpoch)
        const remote = snapshotExamDate(snapshot)
        const latest = batch.operations.at(-1)
        state.sealedBatch = null
        state.accountEpoch = apply.accountEpoch
        state.pendingOperations = []
        const merge = await this.mergeEstablishedBaseline(
          state,
          latest?.payload.examDate ?? normalizedExamDate(localExamDate),
          remote.examDate,
        )
        if (merge !== 'conflict') {
          this.reportStatus({ phase: 'syncing', detail: '已恢复云端基线，等待重试本机修改' })
        }
        return
      }
      const matchingResults = new Map(apply.results.map((result) => [result.operationId, result]))
      const rejected = batch.operations.some((operation) => {
        const result = matchingResults.get(operation.operationId)
        return !result || result.status === 'rejected'
      })
      if (rejected) throw new Error('Tracker shadow sync operation was rejected.')
      const conflicted = batch.operations.some((operation) => (
        matchingResults.get(operation.operationId)?.status === 'conflict'
      ))
      if (conflicted) {
        const snapshot = await this.validateSnapshot(state, accessToken, batch.accountEpoch)
        const remote = snapshotExamDate(snapshot)
        const latest = batch.operations.at(-1)
        state.sealedBatch = null
        state.pendingOperations = []
        const merge = await this.mergeEstablishedBaseline(
          state,
          latest?.payload.examDate ?? normalizedExamDate(localExamDate),
          remote.examDate,
        )
        if (merge !== 'conflict') {
          this.reportStatus({ phase: 'syncing', detail: '已合并另一台设备的更新' })
        }
        return
      }
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
      const remote = snapshotExamDate(snapshot)
      const installed = await this.rememberRemoteExamDate(
        state,
        remote.examDate,
        normalizedExamDate(localExamDate),
        true,
      )
      if (!installed && state.pendingOperations.length > 0) {
        this.reportStatus({ phase: 'syncing', detail: '本机有更新，等待下一次同步' })
        return
      }
      this.reportStatus({
        phase: 'synced',
        lastSyncedAt: state.lastSyncedAt ?? this.now().toISOString(),
        detail: '考试日期已同步',
      })
    })
  }
}
