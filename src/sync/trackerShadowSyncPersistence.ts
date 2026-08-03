import { STORAGE_PREFIX } from '@/lib/constants'
import { isLocalDate } from '@/lib/localDate'
import type {
  TrackerShadowSyncBatch,
  TrackerShadowSyncOperation,
} from '@/sync/trackerShadowSyncProtocol'
import { parseTrackerShadowSyncOperation } from '@/sync/trackerShadowSyncProtocol'

const SHADOW_SYNC_STORAGE_PREFIX = `${STORAGE_PREFIX}:shadowSync:v1:`

export interface TrackerShadowSyncValidation {
  requestId: string
  requestStatus: 'applied' | 'replayed'
  cursor: number
  snapshotHash: string
  remoteEntityCount: number
  validatedAt: string
}

export interface TrackerShadowSyncAccountState {
  schemaVersion: 2
  accountUserId: string
  deviceId: string
  localDataEpoch: string
  accountEpoch: number | null
  cursor: number
  remoteVersion: number
  baselineEstablished: boolean
  baselineConflict?: {
    localExamDate: string | null
    remoteExamDate: string | null
  }
  lastSyncedExamDate: string | null
  lastSyncedAt?: string
  nextLocalSequence: number
  hasObservedExamDate: boolean
  observedExamDate: string | null
  pendingOperations: TrackerShadowSyncOperation[]
  sealedBatch: TrackerShadowSyncBatch | null
  lastValidation?: TrackerShadowSyncValidation
  updatedAt: string
}

export interface TrackerShadowSyncPersistence {
  load(accountUserId: string): Promise<TrackerShadowSyncAccountState | null>
  save(state: TrackerShadowSyncAccountState): Promise<void>
}

function storageKey(kind: 'mirror' | 'journal', accountUserId: string): string {
  return `${SHADOW_SYNC_STORAGE_PREFIX}${kind}:${accountUserId}`
}

function cloneState(state: TrackerShadowSyncAccountState): TrackerShadowSyncAccountState {
  return JSON.parse(JSON.stringify(state)) as TrackerShadowSyncAccountState
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isExamDate(value: unknown): value is string | null {
  return value === null || isLocalDate(value)
}

function parseState(raw: string, accountUserId: string): TrackerShadowSyncAccountState {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Tracker shadow sync persistence is malformed.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Tracker shadow sync persistence is malformed.')
  }
  const state = value as Partial<TrackerShadowSyncAccountState>
  const stateVersion = (value as { schemaVersion?: number }).schemaVersion
  const isLegacyState = stateVersion === 1
  if (
    (!isLegacyState && stateVersion !== 2)
    || state.accountUserId !== accountUserId
    || typeof state.deviceId !== 'string'
    || !state.deviceId
    || typeof state.localDataEpoch !== 'string'
    || (state.accountEpoch !== null && !isSafeInteger(state.accountEpoch))
    || !isSafeInteger(state.cursor)
    || !isSafeInteger(state.remoteVersion)
    || (!isLegacyState && typeof state.baselineEstablished !== 'boolean')
    || (!isLegacyState && state.baselineConflict !== undefined && (
      typeof state.baselineConflict !== 'object'
      || state.baselineConflict === null
      || !isExamDate(state.baselineConflict.localExamDate)
      || !isExamDate(state.baselineConflict.remoteExamDate)
    ))
    || (!isLegacyState && !isExamDate(state.lastSyncedExamDate))
    || (!isLegacyState && state.lastSyncedAt !== undefined && (
      typeof state.lastSyncedAt !== 'string'
      || !Number.isFinite(Date.parse(state.lastSyncedAt))
    ))
    || !isSafeInteger(state.nextLocalSequence)
    || state.nextLocalSequence < 1
    || typeof state.hasObservedExamDate !== 'boolean'
    || (state.observedExamDate !== null && typeof state.observedExamDate !== 'string')
    || !Array.isArray(state.pendingOperations)
    || (state.sealedBatch !== null && (typeof state.sealedBatch !== 'object' || state.sealedBatch === undefined))
    || typeof state.updatedAt !== 'string'
  ) {
    throw new Error('Tracker shadow sync persistence failed validation.')
  }
  const pendingOperations = state.pendingOperations.map(parseTrackerShadowSyncOperation)
  let sealedBatch: TrackerShadowSyncBatch | null = null
  if (state.sealedBatch) {
    const batch = state.sealedBatch as Partial<TrackerShadowSyncBatch>
    if (
      typeof batch.requestId !== 'string'
      || !batch.requestId
      || typeof batch.requestHash !== 'string'
      || !/^[a-f0-9]{64}$/i.test(batch.requestHash)
      || !isSafeInteger(batch.accountEpoch)
      || !Array.isArray(batch.operations)
      || typeof batch.sealedAt !== 'string'
      || !Number.isFinite(Date.parse(batch.sealedAt))
    ) {
      throw new Error('Tracker shadow sync sealed batch failed validation.')
    }
    sealedBatch = {
      requestId: batch.requestId,
      requestHash: batch.requestHash.toLowerCase(),
      accountEpoch: batch.accountEpoch,
      operations: batch.operations.map(parseTrackerShadowSyncOperation),
      sealedAt: batch.sealedAt,
    }
  }
  return cloneState({
    ...(state as TrackerShadowSyncAccountState),
    schemaVersion: 2,
    // The hidden v1 pilot never installed a remote value. Re-running the
    // baseline handshake is therefore the only safe upgrade: an empty device
    // may adopt cloud state, while two different explicit values require a
    // learner choice.
    baselineEstablished: isLegacyState ? false : state.baselineEstablished as boolean,
    ...(isLegacyState ? { baselineConflict: undefined } : {}),
    lastSyncedExamDate: isLegacyState ? null : state.lastSyncedExamDate as string | null,
    ...(isLegacyState ? { lastSyncedAt: undefined } : {}),
    pendingOperations,
    sealedBatch,
  })
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * The account-specific journal is written before its mirror. A reload can
 * therefore recover the exact sealed request after a lost response. IndexedDB
 * promotion is intentionally deferred until this shadow pilot has proven its
 * server contract; no visible learner data depends on this transport cache.
 */
export class BrowserTrackerShadowSyncPersistence implements TrackerShadowSyncPersistence {
  private readonly storage: Storage | null

  constructor(storage: Storage | null = browserStorage()) {
    this.storage = storage
  }

  async load(accountUserId: string): Promise<TrackerShadowSyncAccountState | null> {
    if (!this.storage) throw new Error('Tracker shadow sync storage is unavailable.')
    const journalKey = storageKey('journal', accountUserId)
    const mirrorKey = storageKey('mirror', accountUserId)
    const journal = this.storage.getItem(journalKey)
    if (journal !== null) {
      const recovered = parseState(journal, accountUserId)
      this.storage.setItem(mirrorKey, JSON.stringify(recovered))
      this.storage.removeItem(journalKey)
      return recovered
    }
    const mirror = this.storage.getItem(mirrorKey)
    return mirror === null ? null : parseState(mirror, accountUserId)
  }

  async save(state: TrackerShadowSyncAccountState): Promise<void> {
    if (!this.storage) throw new Error('Tracker shadow sync storage is unavailable.')
    const serialized = JSON.stringify(cloneState(state))
    const journalKey = storageKey('journal', state.accountUserId)
    const mirrorKey = storageKey('mirror', state.accountUserId)
    this.storage.setItem(journalKey, serialized)
    this.storage.setItem(mirrorKey, serialized)
    this.storage.removeItem(journalKey)
  }
}

export function createTrackerShadowSyncAccountState(input: {
  accountUserId: string
  deviceId: string
  localDataEpoch: string
  now: string
}): TrackerShadowSyncAccountState {
  return {
    schemaVersion: 2,
    accountUserId: input.accountUserId,
    deviceId: input.deviceId,
    localDataEpoch: input.localDataEpoch,
    accountEpoch: null,
    cursor: 0,
    remoteVersion: 0,
    baselineEstablished: false,
    lastSyncedExamDate: null,
    nextLocalSequence: 1,
    hasObservedExamDate: false,
    observedExamDate: null,
    pendingOperations: [],
    sealedBatch: null,
    updatedAt: input.now,
  }
}
