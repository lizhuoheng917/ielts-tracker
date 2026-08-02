import { STORAGE_PREFIX } from '@/lib/constants'

export const LOCAL_MUTATION_JOURNAL_SCHEMA_VERSION = 1 as const
export const LOCAL_MUTATION_JOURNAL_KEY = `${STORAGE_PREFIX}:mutationJournal`
export const ACTIVITY_LEDGER_STORAGE_KEY = `${STORAGE_PREFIX}:activityLedger`

export type LocalMutationAction =
  | 'word.create'
  | 'word.update'
  | 'word.delete'
  | 'practice.create'
  | 'practice.update'
  | 'practice.delete'
  | 'timer.create'
  | 'timer.update'
  | 'timer.delete'
  | 'diary.create'
  | 'diary.update'
  | 'diary.delete'
  | 'plan.execution.create'
  | 'plan.execution.update'
  | 'plan.execution.delete'
  | 'plan.execution.reconcile'
  | 'plan.delete'
  | 'settings.checkin'

export interface SnapshotValue {
  exists: boolean
  value?: unknown
}

export interface EntityMutationChange {
  id: string
  before: unknown | null
  beforeIndex: number
  expectedAfter: unknown | null
}

export interface EntityCollectionPatch {
  kind: 'entity-collection'
  storageKey: string
  collection: string
  beforeKeyExisted: boolean
  changes: EntityMutationChange[]
}

export interface StateFieldChange {
  field: string
  before: SnapshotValue
  expectedAfter: SnapshotValue
}

export interface StateFieldsPatch {
  kind: 'state-fields'
  storageKey: string
  beforeKeyExisted: boolean
  fields: StateFieldChange[]
}

export type LocalMutationPatch = EntityCollectionPatch | StateFieldsPatch

export interface LocalMutationJournalV1 {
  schemaVersion: typeof LOCAL_MUTATION_JOURNAL_SCHEMA_VERSION
  transactionId: string
  ownerId: string
  action: LocalMutationAction
  phase: 'prepared' | 'committed'
  createdAt: string
  patches: LocalMutationPatch[]
}

export type LocalRecoveryStatus =
  | 'none'
  | 'rolled-back'
  | 'committed-cleanup'
  | 'conflict'
  | 'failed'

export interface LocalRecoveryReport {
  status: LocalRecoveryStatus
  checkedAt: string
  transactionId?: string
  action?: LocalMutationAction
  detail?: string
  requiresLedgerRebuild: boolean
}

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface LocalMutationRunResult {
  ok: boolean
  committed: boolean
  error?: Error
}

class LocalMutationConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LocalMutationConflictError'
  }
}

interface PersistEnvelope {
  state: Record<string, unknown>
  version?: number
}

let lastRecoveryReport: LocalRecoveryReport = {
  status: 'none',
  checkedAt: new Date().toISOString(),
  requiresLedgerRebuild: false,
}

let fallbackId = 0

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`
  } catch {
    fallbackId += 1
    return `${prefix}-${Date.now()}-${fallbackId}`
  }
}

function getOwnerId(): string {
  const key = `${STORAGE_PREFIX}:mutationOwner`
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const ownerId = createId('tab')
    sessionStorage.setItem(key, ownerId)
    return ownerId
  } catch {
    return createId('runtime')
  }
}

function clone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => deepEqual(value, right[index]))
  }
  if (typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord).sort()
  const rightKeys = Object.keys(rightRecord).sort()
  return deepEqual(leftKeys, rightKeys)
    && leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
}

function snapshotField(state: Record<string, unknown>, field: string): SnapshotValue {
  return Object.prototype.hasOwnProperty.call(state, field)
    ? { exists: true, value: clone(state[field]) }
    : { exists: false }
}

function isSnapshotValue(value: unknown): value is SnapshotValue {
  return typeof value === 'object'
    && value !== null
    && typeof (value as SnapshotValue).exists === 'boolean'
}

function isPatch(value: unknown): value is LocalMutationPatch {
  if (typeof value !== 'object' || value === null) return false
  const patch = value as Partial<LocalMutationPatch>
  if (typeof patch.storageKey !== 'string' || typeof patch.beforeKeyExisted !== 'boolean') {
    return false
  }
  if (patch.kind === 'entity-collection') {
    return typeof patch.collection === 'string'
      && Array.isArray(patch.changes)
      && patch.changes.every((change) => (
        typeof change === 'object'
        && change !== null
        && typeof change.id === 'string'
        && Number.isInteger(change.beforeIndex)
        && Object.prototype.hasOwnProperty.call(change, 'before')
        && Object.prototype.hasOwnProperty.call(change, 'expectedAfter')
      ))
  }
  if (patch.kind === 'state-fields') {
    return Array.isArray(patch.fields)
      && patch.fields.every((field) => (
        typeof field === 'object'
        && field !== null
        && typeof field.field === 'string'
        && isSnapshotValue(field.before)
        && isSnapshotValue(field.expectedAfter)
      ))
  }
  return false
}

function parseJournal(raw: string): LocalMutationJournalV1 {
  const value = JSON.parse(raw) as Partial<LocalMutationJournalV1>
  if (
    value.schemaVersion !== LOCAL_MUTATION_JOURNAL_SCHEMA_VERSION
    || typeof value.transactionId !== 'string'
    || typeof value.ownerId !== 'string'
    || typeof value.action !== 'string'
    || (value.phase !== 'prepared' && value.phase !== 'committed')
    || typeof value.createdAt !== 'string'
    || !Array.isArray(value.patches)
    || !value.patches.every(isPatch)
  ) {
    throw new LocalMutationConflictError('事务检查点格式无效，已停止自动恢复。')
  }
  return value as LocalMutationJournalV1
}

function readEnvelope(storage: StorageLike, key: string): PersistEnvelope {
  const raw = storage.getItem(key)
  if (raw === null) return { state: {} }
  const parsed = JSON.parse(raw) as Partial<PersistEnvelope>
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.state !== 'object' || parsed.state === null) {
    throw new LocalMutationConflictError(`${key} 不是有效的 Zustand 持久化数据。`)
  }
  return {
    state: parsed.state as Record<string, unknown>,
    version: parsed.version,
  }
}

function writeEnvelope(storage: StorageLike, key: string, envelope: PersistEnvelope): void {
  storage.setItem(key, JSON.stringify(envelope))
}

function currentEntity(collection: unknown[], id: string): { value: unknown | null; index: number } {
  const index = collection.findIndex((item) => (
    typeof item === 'object'
    && item !== null
    && (item as { id?: unknown }).id === id
  ))
  return { value: index >= 0 ? collection[index] : null, index }
}

function valueMatchesSnapshot(state: Record<string, unknown>, field: string, snapshot: SnapshotValue) {
  const current = snapshotField(state, field)
  return current.exists === snapshot.exists
    && (!current.exists || deepEqual(current.value, snapshot.value))
}

function patchMatchesExpected(storage: StorageLike, patch: LocalMutationPatch): boolean {
  const envelope = readEnvelope(storage, patch.storageKey)
  if (patch.kind === 'state-fields') {
    return patch.fields.every((field) => (
      valueMatchesSnapshot(envelope.state, field.field, field.expectedAfter)
    ))
  }

  const collection = envelope.state[patch.collection]
  if (!Array.isArray(collection)) return patch.changes.every((change) => change.expectedAfter === null)
  return patch.changes.every((change) => (
    deepEqual(currentEntity(collection, change.id).value, change.expectedAfter)
  ))
}

function rollbackPatch(storage: StorageLike, patch: LocalMutationPatch): void {
  // A freshly hydrated Zustand store can have meaningful in-memory defaults
  // before its key has ever been persisted. If this transaction also observed
  // no key and the key is still absent, the patch is already at its raw-storage
  // before state.
  if (!patch.beforeKeyExisted && storage.getItem(patch.storageKey) === null) return

  const envelope = readEnvelope(storage, patch.storageKey)

  if (patch.kind === 'state-fields') {
    for (const field of patch.fields) {
      const matchesBefore = valueMatchesSnapshot(envelope.state, field.field, field.before)
      const matchesAfter = valueMatchesSnapshot(envelope.state, field.field, field.expectedAfter)
      if (!matchesBefore && !matchesAfter) {
        throw new LocalMutationConflictError(`${patch.storageKey}.${field.field} 已被其他写入修改。`)
      }
    }
    for (const field of patch.fields) {
      if (field.before.exists) envelope.state[field.field] = clone(field.before.value)
      else delete envelope.state[field.field]
    }
  } else {
    const existing = envelope.state[patch.collection]
    const collection = Array.isArray(existing) ? [...existing] : []
    for (const change of patch.changes) {
      const current = currentEntity(collection, change.id).value
      if (!deepEqual(current, change.before) && !deepEqual(current, change.expectedAfter)) {
        throw new LocalMutationConflictError(`${patch.storageKey}.${patch.collection}:${change.id} 已被其他写入修改。`)
      }
    }
    for (const change of [...patch.changes].reverse()) {
      const current = currentEntity(collection, change.id)
      if (current.index >= 0) collection.splice(current.index, 1)
      if (change.before !== null) {
        const index = Math.max(0, Math.min(change.beforeIndex, collection.length))
        collection.splice(index, 0, clone(change.before))
      }
    }
    envelope.state[patch.collection] = collection
  }

  if (!patch.beforeKeyExisted) storage.removeItem(patch.storageKey)
  else writeEnvelope(storage, patch.storageKey, envelope)
}

function removeJournal(
  storage: StorageLike,
  expected?: Pick<LocalMutationJournalV1, 'transactionId' | 'ownerId'>,
): void {
  if (expected) {
    const current = readPendingLocalMutation(storage)
    if (
      !current
      || current.transactionId !== expected.transactionId
      || current.ownerId !== expected.ownerId
    ) {
      throw new LocalMutationConflictError('事务检查点已由另一个页面接管，已停止清理。')
    }
  }
  storage.removeItem(LOCAL_MUTATION_JOURNAL_KEY)
}

export function getLastLocalRecoveryReport(): LocalRecoveryReport {
  return { ...lastRecoveryReport }
}

export function readPendingLocalMutation(
  storage: StorageLike = localStorage,
): LocalMutationJournalV1 | null {
  const raw = storage.getItem(LOCAL_MUTATION_JOURNAL_KEY)
  return raw === null ? null : parseJournal(raw)
}

export function createEntityCollectionPatch(input: {
  storage: StorageLike
  storageKey: string
  collection: string
  changes: EntityMutationChange[]
}): EntityCollectionPatch {
  return {
    kind: 'entity-collection',
    storageKey: input.storageKey,
    collection: input.collection,
    beforeKeyExisted: input.storage.getItem(input.storageKey) !== null,
    changes: clone(input.changes),
  }
}

export function createStateFieldsPatch(input: {
  storage: StorageLike
  storageKey: string
  beforeState: Record<string, unknown>
  expectedAfterState: Record<string, unknown>
  fields: string[]
}): StateFieldsPatch {
  const beforeKeyExisted = input.storage.getItem(input.storageKey) !== null
  // Persisted state is the recovery contract. Zustand may merge defaults into
  // memory for legacy keys that do not contain every current field, so copying
  // the in-memory object here could manufacture fields that never existed on
  // disk and make an untouched key look conflicted after a restart.
  const persistedBeforeState = beforeKeyExisted
    ? readEnvelope(input.storage, input.storageKey).state
    : input.beforeState

  return {
    kind: 'state-fields',
    storageKey: input.storageKey,
    beforeKeyExisted,
    fields: input.fields.map((field) => ({
      field,
      before: snapshotField(persistedBeforeState, field),
      expectedAfter: snapshotField(input.expectedAfterState, field),
    })),
  }
}

export function createLocalMutation(input: {
  action: LocalMutationAction
  patches: LocalMutationPatch[]
  createdAt?: string
}): LocalMutationJournalV1 {
  return {
    schemaVersion: LOCAL_MUTATION_JOURNAL_SCHEMA_VERSION,
    transactionId: createId('tx'),
    ownerId: getOwnerId(),
    action: input.action,
    phase: 'prepared',
    createdAt: input.createdAt ?? new Date().toISOString(),
    patches: clone(input.patches),
  }
}

export function prepareLocalMutation(
  transaction: LocalMutationJournalV1,
  storage: StorageLike = localStorage,
): void {
  if (storage.getItem(LOCAL_MUTATION_JOURNAL_KEY) !== null) {
    throw new Error('已有未完成的数据事务，请重新加载页面完成恢复。')
  }
  const serialized = JSON.stringify({ ...transaction, phase: 'prepared' })

  try {
    storage.setItem(LOCAL_MUTATION_JOURNAL_KEY, serialized)
  } catch {
    // The activity ledger is rebuildable. Freeing it is the only safe automatic
    // quota recovery before refusing the canonical mutation.
    storage.removeItem(ACTIVITY_LEDGER_STORAGE_KEY)
    storage.setItem(LOCAL_MUTATION_JOURNAL_KEY, serialized)
  }

  const persisted = readPendingLocalMutation(storage)
  if (
    !persisted
    || persisted.transactionId !== transaction.transactionId
    || persisted.ownerId !== transaction.ownerId
  ) {
    throw new Error('事务检查点写入后校验失败，学习数据未修改。')
  }
}

export function markLocalMutationCommitted(
  transaction: LocalMutationJournalV1,
  storage: StorageLike = localStorage,
): void {
  const current = readPendingLocalMutation(storage)
  if (
    !current
    || current.transactionId !== transaction.transactionId
    || current.ownerId !== transaction.ownerId
  ) {
    throw new LocalMutationConflictError('事务检查点归属已经变化，已停止提交。')
  }
  const committed: LocalMutationJournalV1 = { ...transaction, phase: 'committed' }
  storage.setItem(LOCAL_MUTATION_JOURNAL_KEY, JSON.stringify(committed))
  const persisted = readPendingLocalMutation(storage)
  if (
    !persisted
    || persisted.phase !== 'committed'
    || persisted.transactionId !== transaction.transactionId
    || persisted.ownerId !== transaction.ownerId
  ) {
    throw new Error('事务提交标记写入失败。')
  }
}

export function verifyLocalMutationExpected(
  transaction: LocalMutationJournalV1,
  storage: StorageLike = localStorage,
): boolean {
  return transaction.patches.every((patch) => patchMatchesExpected(storage, patch))
}

export function recoverPendingLocalMutation(
  storage: StorageLike = localStorage,
  checkedAt = new Date().toISOString(),
): LocalRecoveryReport {
  let transaction: LocalMutationJournalV1 | null = null
  try {
    transaction = readPendingLocalMutation(storage)
    if (!transaction) {
      lastRecoveryReport = { status: 'none', checkedAt, requiresLedgerRebuild: false }
      return getLastLocalRecoveryReport()
    }

    if (transaction.phase === 'committed') {
      storage.removeItem(ACTIVITY_LEDGER_STORAGE_KEY)
      removeJournal(storage, transaction)
      lastRecoveryReport = {
        status: 'committed-cleanup',
        checkedAt,
        transactionId: transaction.transactionId,
        action: transaction.action,
        requiresLedgerRebuild: true,
      }
      return getLastLocalRecoveryReport()
    }

    for (const patch of [...transaction.patches].reverse()) rollbackPatch(storage, patch)
    removeJournal(storage, transaction)
    lastRecoveryReport = {
      status: 'rolled-back',
      checkedAt,
      transactionId: transaction.transactionId,
      action: transaction.action,
      requiresLedgerRebuild: false,
    }
    return getLastLocalRecoveryReport()
  } catch (error) {
    lastRecoveryReport = {
      status: error instanceof LocalMutationConflictError ? 'conflict' : 'failed',
      checkedAt,
      transactionId: transaction?.transactionId,
      action: transaction?.action,
      detail: error instanceof Error ? error.message : '未知恢复错误',
      requiresLedgerRebuild: false,
    }
    return getLastLocalRecoveryReport()
  }
}

export function runLocalMutation(
  transaction: LocalMutationJournalV1,
  applyCanonical: () => void,
  afterCommitted: () => void,
  storage: StorageLike = localStorage,
): LocalMutationRunResult {
  try {
    prepareLocalMutation(transaction, storage)
  } catch (error) {
    return { ok: false, committed: false, error: error as Error }
  }

  try {
    applyCanonical()
    if (!verifyLocalMutationExpected(transaction, storage)) {
      throw new Error('事务写入后的正式数据与预期不一致。')
    }
    markLocalMutationCommitted(transaction, storage)
  } catch (error) {
    try {
      const pending = readPendingLocalMutation(storage)
      if (
        pending?.transactionId === transaction.transactionId
        && pending.ownerId === transaction.ownerId
      ) {
        recoverPendingLocalMutation(storage)
      }
    } catch {
      // A foreign or damaged marker must be handled by coordinated startup
      // recovery; this writer must never roll it back or delete it.
    }
    return { ok: false, committed: false, error: error as Error }
  }

  try {
    afterCommitted()
    removeJournal(storage, transaction)
  } catch (error) {
    // Canonical data is already committed. Keep the marker so the next startup
    // preserves it and rebuilds the disposable activity ledger.
    return { ok: true, committed: true, error: error as Error }
  }

  return { ok: true, committed: true }
}
