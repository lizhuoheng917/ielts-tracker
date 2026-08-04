import {
  parseTrackerPhase4bPayload,
  parseTrackerPhase4bRemoteEntity,
  trackerPhase4bUtf8Bytes,
  TRACKER_PHASE4B_ENTITY_KINDS,
  TRACKER_PHASE4B_UTF8_LIMITS,
  type AnyTrackerPhase4bPayload,
  type TrackerPhase4bEntityKind,
  type TrackerPhase4bRemoteEntity,
  type TrackerPhase4bRestoreRequired,
} from '@/sync/trackerPhase4bRecordSync'

const PHASE4B_SYNC_DATABASE = 'ielts-tracker-sync'
const PHASE4B_SYNC_OBJECT_STORE = 'phase4b-sync-v1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH_PATTERN = /^[a-f0-9]{64}$/i
const MAX_PERSISTED_ENTITIES = 50_000
const MAX_PERSISTED_PENDING_OPERATIONS = 5_000
const MAX_PERSISTED_BLOCKED_OPERATIONS = 5_000

type UnknownRecord = Record<string, unknown>

export interface TrackerPhase4bSyncOperation {
  operationId: string
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  action: 'upsert' | 'delete'
  localSequence: number
  baseVersion: number
  occurredAt: string
  payload?: AnyTrackerPhase4bPayload
}

export interface TrackerPhase4bSyncBatch {
  requestId: string
  requestHash: string
  accountEpoch: number
  operations: TrackerPhase4bSyncOperation[]
  sealedAt: string
}

export interface TrackerPhase4bSyncValidation {
  requestId: string
  requestStatus: 'applied' | 'replayed'
  cursor: number
  snapshotHash: string
  remoteEntityCount: number
  validatedAt: string
}

export interface TrackerPhase4bBlockedOperation {
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  signature: string
  reason: string
  blockedAt: string
}

export interface TrackerPhase4bSyncAccountState {
  schemaVersion: 1
  accountUserId: string
  deviceId: string
  localDataEpoch: string
  accountEpoch: number | null
  cursor: number
  baselineEstablished: boolean
  baseline: TrackerPhase4bRemoteEntity[]
  observedFingerprint: string | null
  restoreRequired: TrackerPhase4bRestoreRequired[]
  blockedOperations: TrackerPhase4bBlockedOperation[]
  nextLocalSequence: number
  pendingOperations: TrackerPhase4bSyncOperation[]
  sealedBatch: TrackerPhase4bSyncBatch | null
  lastSyncedAt?: string
  lastValidation?: TrackerPhase4bSyncValidation
  updatedAt: string
}

export interface TrackerPhase4bSyncPersistence {
  load(accountUserId: string): Promise<TrackerPhase4bSyncAccountState | null>
  save(state: TrackerPhase4bSyncAccountState): Promise<void>
  /** Clears this device's baseline and outbox for a permanently deleted account. */
  delete(accountUserId: string): Promise<void>
}

export interface TrackerPhase4bSyncKeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  /** Optional only for injected test stores; browser IndexedDB always supports it. */
  remove?(key: string): Promise<void>
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function record(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`)
  }
  return value as UnknownRecord
}

function exactKeys(value: UnknownRecord, keys: readonly string[], label: string): void {
  const allowed = new Set(keys)
  const unsupported = Object.keys(value).find((key) => !allowed.has(key))
  if (unsupported) throw new Error(`${label} contains unsupported field ${unsupported}.`)
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`)
  }
  return value
}

function identifier(value: unknown, label: string): string {
  const parsed = stringValue(value, label)
  if (trackerPhase4bUtf8Bytes(parsed) > TRACKER_PHASE4B_UTF8_LIMITS.identifier) {
    throw new Error(`${label} exceeds the identifier byte limit.`)
  }
  return parsed
}

function uuid(value: unknown, label: string): string {
  const parsed = stringValue(value, label)
  if (!UUID_PATTERN.test(parsed)) throw new Error(`${label} must be a UUID.`)
  return parsed
}

function timestamp(value: unknown, label: string): string {
  const parsed = stringValue(value, label)
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`${label} must be a timestamp.`)
  return parsed
}

function safeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = safeInteger(value, label)
  if (parsed < 1) throw new Error(`${label} must be positive.`)
  return parsed
}

function entityKind(value: unknown, label: string): TrackerPhase4bEntityKind {
  if (
    typeof value !== 'string'
    || !(TRACKER_PHASE4B_ENTITY_KINDS as readonly string[]).includes(value)
  ) {
    throw new Error(`${label} is not a Phase 4B entity kind.`)
  }
  return value as TrackerPhase4bEntityKind
}

export function parseTrackerPhase4bSyncOperation(value: unknown): TrackerPhase4bSyncOperation {
  const operation = record(value, 'Phase 4B operation')
  exactKeys(operation, [
    'operationId',
    'entityKind',
    'entityId',
    'action',
    'localSequence',
    'baseVersion',
    'occurredAt',
    'payload',
  ], 'Phase 4B operation')
  const kind = entityKind(operation.entityKind, 'Phase 4B operation.entityKind')
  if (operation.action !== 'upsert' && operation.action !== 'delete') {
    throw new Error('Phase 4B operation.action is unsupported.')
  }
  if (operation.action === 'upsert' && operation.payload === undefined) {
    throw new Error('Phase 4B upsert requires payload.')
  }
  if (operation.action === 'delete' && operation.payload !== undefined) {
    throw new Error('Phase 4B delete must not include payload.')
  }
  return {
    operationId: uuid(operation.operationId, 'Phase 4B operation.operationId'),
    entityKind: kind,
    entityId: identifier(operation.entityId, 'Phase 4B operation.entityId'),
    action: operation.action,
    localSequence: positiveInteger(operation.localSequence, 'Phase 4B operation.localSequence'),
    baseVersion: safeInteger(operation.baseVersion, 'Phase 4B operation.baseVersion'),
    occurredAt: timestamp(operation.occurredAt, 'Phase 4B operation.occurredAt'),
    ...(operation.action === 'upsert'
      ? { payload: parseTrackerPhase4bPayload(kind, operation.payload) }
      : {}),
  }
}

function parseStoredRemoteEntity(value: unknown, label: string): TrackerPhase4bRemoteEntity {
  const stored = record(value, label)
  exactKeys(stored, [
    'entityKind',
    'entityId',
    'semanticKey',
    'version',
    'cursor',
    'payload',
    'deletedAt',
    'updatedAt',
  ], label)
  const { semanticKey, ...wire } = stored
  const parsed = parseTrackerPhase4bRemoteEntity(wire)
  if (semanticKey === parsed.semanticKey) return parsed

  // The server intentionally returns payload=null for a tombstone. An
  // execution therefore persists the planId/date key inherited from the prior
  // live physical row so a random local id cannot resurrect it after reload.
  const executionPrefix = 'plan_execution\u0000'
  const inheritedExecutionKey = parsed.entityKind === 'plan_execution'
    && parsed.deletedAt !== null
    && typeof semanticKey === 'string'
    && semanticKey.startsWith(executionPrefix)
    ? semanticKey.slice(executionPrefix.length).split('\u001f')
    : []
  if (inheritedExecutionKey.length === 2) {
    parseTrackerPhase4bPayload('plan_execution', {
      planId: inheritedExecutionKey[0],
      date: inheritedExecutionKey[1],
      isCompleted: false,
    }, `${label}.semanticKey`)
    return { ...parsed, semanticKey } as TrackerPhase4bRemoteEntity
  }
  if (semanticKey !== parsed.semanticKey) {
    throw new Error(`${label}.semanticKey does not match its payload.`)
  }
  return parsed
}

function parseRestoreRequired(value: unknown, label: string): TrackerPhase4bRestoreRequired {
  const restore = record(value, label)
  exactKeys(restore, ['entityKind', 'entityId', 'reason'], label)
  if (restore.reason !== 'cloud_tombstone_requires_explicit_restore') {
    throw new Error(`${label}.reason is unsupported.`)
  }
  return {
    entityKind: entityKind(restore.entityKind, `${label}.entityKind`),
    entityId: identifier(restore.entityId, `${label}.entityId`),
    reason: 'cloud_tombstone_requires_explicit_restore',
  }
}

function parseBlockedOperation(value: unknown, label: string): TrackerPhase4bBlockedOperation {
  const blocked = record(value, label)
  exactKeys(blocked, ['entityKind', 'entityId', 'signature', 'reason', 'blockedAt'], label)
  const signature = stringValue(blocked.signature, `${label}.signature`)
  if (!HASH_PATTERN.test(signature)) throw new Error(`${label}.signature must be a SHA-256 hash.`)
  const reason = stringValue(blocked.reason, `${label}.reason`)
  if (trackerPhase4bUtf8Bytes(reason) > 512) throw new Error(`${label}.reason is too large.`)
  return {
    entityKind: entityKind(blocked.entityKind, `${label}.entityKind`),
    entityId: identifier(blocked.entityId, `${label}.entityId`),
    signature: signature.toLowerCase(),
    reason,
    blockedAt: timestamp(blocked.blockedAt, `${label}.blockedAt`),
  }
}

function parseBatch(value: unknown): TrackerPhase4bSyncBatch {
  const batch = record(value, 'Phase 4B sealed batch')
  exactKeys(batch, [
    'requestId',
    'requestHash',
    'accountEpoch',
    'operations',
    'sealedAt',
  ], 'Phase 4B sealed batch')
  if (!Array.isArray(batch.operations) || batch.operations.length === 0) {
    throw new Error('Phase 4B sealed batch.operations must be non-empty.')
  }
  const requestHash = stringValue(batch.requestHash, 'Phase 4B sealed batch.requestHash')
  if (!HASH_PATTERN.test(requestHash)) {
    throw new Error('Phase 4B sealed batch.requestHash must be a SHA-256 hash.')
  }
  return {
    requestId: uuid(batch.requestId, 'Phase 4B sealed batch.requestId'),
    requestHash: requestHash.toLowerCase(),
    accountEpoch: safeInteger(batch.accountEpoch, 'Phase 4B sealed batch.accountEpoch'),
    operations: batch.operations.map(parseTrackerPhase4bSyncOperation),
    sealedAt: timestamp(batch.sealedAt, 'Phase 4B sealed batch.sealedAt'),
  }
}

function parseValidation(value: unknown): TrackerPhase4bSyncValidation {
  const validation = record(value, 'Phase 4B validation')
  exactKeys(validation, [
    'requestId',
    'requestStatus',
    'cursor',
    'snapshotHash',
    'remoteEntityCount',
    'validatedAt',
  ], 'Phase 4B validation')
  if (validation.requestStatus !== 'applied' && validation.requestStatus !== 'replayed') {
    throw new Error('Phase 4B validation.requestStatus is unsupported.')
  }
  return {
    requestId: uuid(validation.requestId, 'Phase 4B validation.requestId'),
    requestStatus: validation.requestStatus,
    cursor: safeInteger(validation.cursor, 'Phase 4B validation.cursor'),
    snapshotHash: stringValue(validation.snapshotHash, 'Phase 4B validation.snapshotHash'),
    remoteEntityCount: safeInteger(
      validation.remoteEntityCount,
      'Phase 4B validation.remoteEntityCount',
    ),
    validatedAt: timestamp(validation.validatedAt, 'Phase 4B validation.validatedAt'),
  }
}

export function parseTrackerPhase4bSyncAccountState(
  value: unknown,
  accountUserId: string,
): TrackerPhase4bSyncAccountState {
  const state = record(value, 'Phase 4B sync state')
  exactKeys(state, [
    'schemaVersion',
    'accountUserId',
    'deviceId',
    'localDataEpoch',
    'accountEpoch',
    'cursor',
    'baselineEstablished',
    'baseline',
    'observedFingerprint',
    'restoreRequired',
    'blockedOperations',
    'nextLocalSequence',
    'pendingOperations',
    'sealedBatch',
    'lastSyncedAt',
    'lastValidation',
    'updatedAt',
  ], 'Phase 4B sync state')
  if (state.schemaVersion !== 1 || state.accountUserId !== accountUserId) {
    throw new Error('Phase 4B sync state belongs to another schema or account.')
  }
  if (typeof state.baselineEstablished !== 'boolean') {
    throw new Error('Phase 4B sync state.baselineEstablished must be boolean.')
  }
  if (!Array.isArray(state.baseline) || state.baseline.length > MAX_PERSISTED_ENTITIES) {
    throw new Error('Phase 4B sync state.baseline is invalid or too large.')
  }
  if (
    !Array.isArray(state.pendingOperations)
    || state.pendingOperations.length > MAX_PERSISTED_PENDING_OPERATIONS
  ) {
    throw new Error('Phase 4B sync state.pendingOperations is invalid or too large.')
  }
  if (!Array.isArray(state.restoreRequired)) {
    throw new Error('Phase 4B sync state.restoreRequired must be an array.')
  }
  if (!Array.isArray(state.blockedOperations)) {
    throw new Error('Phase 4B sync state.blockedOperations must be an array.')
  }
  if (state.blockedOperations.length > MAX_PERSISTED_BLOCKED_OPERATIONS) {
    throw new Error('Phase 4B sync state.blockedOperations is too large.')
  }
  if (state.observedFingerprint !== null && typeof state.observedFingerprint !== 'string') {
    throw new Error('Phase 4B sync state.observedFingerprint is invalid.')
  }
  if (state.accountEpoch !== null) {
    safeInteger(state.accountEpoch, 'Phase 4B sync state.accountEpoch')
  }
  if (state.sealedBatch !== null && state.sealedBatch === undefined) {
    throw new Error('Phase 4B sync state.sealedBatch is invalid.')
  }
  const lastSyncedAt = state.lastSyncedAt === undefined
    ? undefined
    : timestamp(state.lastSyncedAt, 'Phase 4B sync state.lastSyncedAt')
  const lastValidation = state.lastValidation === undefined
    ? undefined
    : parseValidation(state.lastValidation)
  return clone({
    schemaVersion: 1,
    accountUserId,
    deviceId: uuid(state.deviceId, 'Phase 4B sync state.deviceId'),
    localDataEpoch: stringValue(state.localDataEpoch, 'Phase 4B sync state.localDataEpoch'),
    accountEpoch: state.accountEpoch as number | null,
    cursor: safeInteger(state.cursor, 'Phase 4B sync state.cursor'),
    baselineEstablished: state.baselineEstablished,
    baseline: state.baseline.map((item, index) => (
      parseStoredRemoteEntity(item, `Phase 4B sync state.baseline[${index}]`)
    )),
    observedFingerprint: state.observedFingerprint as string | null,
    restoreRequired: state.restoreRequired.map((item, index) => (
      parseRestoreRequired(item, `Phase 4B sync state.restoreRequired[${index}]`)
    )),
    blockedOperations: state.blockedOperations.map((item, index) => (
      parseBlockedOperation(item, `Phase 4B sync state.blockedOperations[${index}]`)
    )),
    nextLocalSequence: positiveInteger(
      state.nextLocalSequence,
      'Phase 4B sync state.nextLocalSequence',
    ),
    pendingOperations: state.pendingOperations.map(parseTrackerPhase4bSyncOperation),
    sealedBatch: state.sealedBatch === null ? null : parseBatch(state.sealedBatch),
    ...(lastSyncedAt ? { lastSyncedAt } : {}),
    ...(lastValidation ? { lastValidation } : {}),
    updatedAt: timestamp(state.updatedAt, 'Phase 4B sync state.updatedAt'),
  })
}

function browserIndexedDb(): IDBFactory | null {
  return typeof indexedDB === 'undefined' ? null : indexedDB
}

class IndexedDbTrackerPhase4bKeyValueStore implements TrackerPhase4bSyncKeyValueStore {
  private databasePromise: Promise<IDBDatabase> | null = null
  private readonly factory: IDBFactory

  constructor(factory: IDBFactory) {
    this.factory = factory
  }

  private database(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.factory.open(PHASE4B_SYNC_DATABASE, 1)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(PHASE4B_SYNC_OBJECT_STORE)) {
          database.createObjectStore(PHASE4B_SYNC_OBJECT_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Phase 4B IndexedDB open failed.'))
      request.onblocked = () => reject(new Error('Phase 4B IndexedDB upgrade is blocked.'))
    })
    return this.databasePromise
  }

  async get(key: string): Promise<string | null> {
    const database = await this.database()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PHASE4B_SYNC_OBJECT_STORE, 'readonly')
      const request = transaction.objectStore(PHASE4B_SYNC_OBJECT_STORE).get(key)
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
      request.onerror = () => reject(request.error ?? new Error('Phase 4B IndexedDB read failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Phase 4B IndexedDB read aborted.'))
    })
  }

  async set(key: string, value: string): Promise<void> {
    const database = await this.database()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PHASE4B_SYNC_OBJECT_STORE, 'readwrite')
      transaction.objectStore(PHASE4B_SYNC_OBJECT_STORE).put(value, key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Phase 4B IndexedDB write failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Phase 4B IndexedDB write aborted.'))
    })
  }

  async remove(key: string): Promise<void> {
    const database = await this.database()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PHASE4B_SYNC_OBJECT_STORE, 'readwrite')
      transaction.objectStore(PHASE4B_SYNC_OBJECT_STORE).delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Phase 4B IndexedDB delete failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Phase 4B IndexedDB delete aborted.'))
    })
  }
}

/**
 * Phase 4B keeps the full reconciliation baseline and durable outbox in
 * IndexedDB, not localStorage. One object-store put atomically persists the
 * sealed request before network apply, so a reload can replay it byte-for-byte
 * without duplicating learner records into the browser's small synchronous
 * localStorage quota.
 */
export class BrowserTrackerPhase4bSyncPersistence implements TrackerPhase4bSyncPersistence {
  private readonly store: TrackerPhase4bSyncKeyValueStore | null

  constructor(store?: TrackerPhase4bSyncKeyValueStore | null) {
    const factory = browserIndexedDb()
    this.store = store === undefined
      ? factory ? new IndexedDbTrackerPhase4bKeyValueStore(factory) : null
      : store
  }

  async load(accountUserId: string): Promise<TrackerPhase4bSyncAccountState | null> {
    if (!this.store) throw new Error('Phase 4B IndexedDB storage is unavailable.')
    const raw = await this.store.get(accountUserId)
    if (raw === null) return null
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('Phase 4B IndexedDB state is malformed.')
    }
    return parseTrackerPhase4bSyncAccountState(value, accountUserId)
  }

  async save(state: TrackerPhase4bSyncAccountState): Promise<void> {
    if (!this.store) throw new Error('Phase 4B IndexedDB storage is unavailable.')
    const validated = parseTrackerPhase4bSyncAccountState(state, state.accountUserId)
    await this.store.set(state.accountUserId, JSON.stringify(validated))
  }

  async delete(accountUserId: string): Promise<void> {
    if (!this.store) throw new Error('Phase 4B IndexedDB storage is unavailable.')
    if (!this.store.remove) {
      throw new Error('Phase 4B IndexedDB storage cannot clear an account state.')
    }
    await this.store.remove(accountUserId)
  }
}

export function createTrackerPhase4bSyncAccountState(input: {
  accountUserId: string
  deviceId: string
  localDataEpoch: string
  now: string
}): TrackerPhase4bSyncAccountState {
  return parseTrackerPhase4bSyncAccountState({
    schemaVersion: 1,
    accountUserId: input.accountUserId,
    deviceId: input.deviceId,
    localDataEpoch: input.localDataEpoch,
    accountEpoch: null,
    cursor: 0,
    baselineEstablished: false,
    baseline: [],
    observedFingerprint: null,
    restoreRequired: [],
    blockedOperations: [],
    nextLocalSequence: 1,
    pendingOperations: [],
    sealedBatch: null,
    updatedAt: input.now,
  }, input.accountUserId)
}
