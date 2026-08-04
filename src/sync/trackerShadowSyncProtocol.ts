import { isLocalDate } from '@/lib/localDate'

export const TRACKER_SHADOW_SYNC_ENTITY_KIND = 'tracker_preferences' as const
export const TRACKER_SHADOW_SYNC_ENTITY_ID = 'preferences' as const

export interface TrackerShadowSyncOperation {
  operationId: string
  entityKind: typeof TRACKER_SHADOW_SYNC_ENTITY_KIND
  entityId: typeof TRACKER_SHADOW_SYNC_ENTITY_ID
  action: 'upsert'
  localSequence: number
  baseVersion: number
  occurredAt: string
  payload: { examDate: string | null }
}

export interface TrackerShadowSyncBatch {
  requestId: string
  requestHash: string
  accountEpoch: number
  operations: readonly TrackerShadowSyncOperation[]
  sealedAt: string
}

export interface TrackerSyncCapabilities {
  product: 'tracker'
  schemaVersion: 1
  protocolVersion: 1
  enabled: boolean
  accountEpoch: number
  currentCursor: number
  allowedEntityKinds: string[]
  maxBatchSize: number
  maxPayloadBytes: number
  /** Absent on the pre-selective server; false keeps backward compatibility. */
  selectiveContentCloudV1: boolean
  /** The administrator may support the protocol while pausing new uploads. */
  selectiveContentCloudEnabled: boolean
  /** Optional live quota view. Missing data must never be guessed client-side. */
  contentQuota: Partial<Record<string, TrackerSyncContentQuota>> | null
}

export interface TrackerSyncContentQuota {
  limit: number | null
  used: number
  remaining: number | null
  legacyExemptCount?: number
}

export interface TrackerSyncApplyResult {
  status: 'applied' | 'replayed' | 'disabled' | 'epoch_mismatch' | 'snapshot_required'
  requestId: string
  requestHash: string
  accountEpoch: number
  cursor: number
  results: Array<{
    operationId: string
    entityKind: string
    entityId: string
    status: 'applied' | 'duplicate' | 'conflict' | 'rejected'
    version: number
    cursor: number
    reason?: string | null
  }>
}

export interface TrackerSyncPullResult {
  enabled: boolean
  accountEpoch: number
  cursor: number
  nextCursor: number
  hasMore: boolean
  changes: Array<{
    cursor: number
    entityKind: string
    entityId: string
    version: number
    payload: unknown
    deletedAt: string | null
    updatedAt: string
  }>
}

export interface TrackerSyncSnapshotResult {
  enabled: boolean
  accountEpoch: number
  cursor: number
  generatedAt: string
  snapshotHash: string
  entities: Array<{
    entityKind: string
    entityId: string
    version: number
    cursor: number
    payload: unknown
    deletedAt: string | null
    updatedAt: string
  }>
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`)
  return value
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be a string.`)
  return value
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`)
  }
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`)
  return value
}

function timestamp(value: unknown, label: string): string {
  const parsed = stringValue(value, label)
  if (!Number.isFinite(Date.parse(parsed))) throw new Error(`${label} must be a timestamp.`)
  return parsed
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null) return null
  return integer(value, label)
}

function parseContentQuota(value: unknown): Partial<Record<string, TrackerSyncContentQuota>> | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value)) return null
  const output: Partial<Record<string, TrackerSyncContentQuota>> = {}
  for (const [kind, raw] of Object.entries(value)) {
    if (!isRecord(raw)) return null
    try {
      const limit = nullableInteger(raw.limit, `capabilities.contentQuota.${kind}.limit`)
      const used = integer(raw.used, `capabilities.contentQuota.${kind}.used`)
      const remaining = nullableInteger(raw.remaining, `capabilities.contentQuota.${kind}.remaining`)
      const legacyExemptCount = raw.legacyExemptCount === undefined
        ? undefined
        : integer(raw.legacyExemptCount, `capabilities.contentQuota.${kind}.legacyExemptCount`)
      output[kind] = {
        limit,
        used,
        remaining,
        ...(legacyExemptCount === undefined ? {} : { legacyExemptCount }),
      }
    } catch {
      // Capacity is informational. A malformed optional view must not make
      // otherwise valid local-first learning records unsyncable.
      return null
    }
  }
  return output
}

export function parseTrackerShadowSyncOperation(value: unknown): TrackerShadowSyncOperation {
  const operation = record(value, 'shadow operation')
  const allowedKeys = new Set([
    'operationId',
    'entityKind',
    'entityId',
    'action',
    'localSequence',
    'baseVersion',
    'occurredAt',
    'payload',
  ])
  if (Object.keys(operation).some((key) => !allowedKeys.has(key))) {
    throw new Error('shadow operation contains unsupported fields.')
  }
  if (
    operation.entityKind !== TRACKER_SHADOW_SYNC_ENTITY_KIND
    || operation.entityId !== TRACKER_SHADOW_SYNC_ENTITY_ID
    || operation.action !== 'upsert'
  ) {
    throw new Error('shadow operation is outside the exam-date pilot.')
  }
  const payload = record(operation.payload, 'shadow operation.payload')
  if (Object.keys(payload).some((key) => key !== 'examDate')) {
    throw new Error('shadow operation.payload contains unsupported fields.')
  }
  if (payload.examDate !== null && !isLocalDate(payload.examDate)) {
    throw new Error('shadow operation.payload.examDate is invalid.')
  }
  const localSequence = integer(operation.localSequence, 'shadow operation.localSequence')
  if (localSequence < 1) throw new Error('shadow operation.localSequence must be positive.')
  return {
    operationId: stringValue(operation.operationId, 'shadow operation.operationId'),
    entityKind: TRACKER_SHADOW_SYNC_ENTITY_KIND,
    entityId: TRACKER_SHADOW_SYNC_ENTITY_ID,
    action: 'upsert',
    localSequence,
    baseVersion: integer(operation.baseVersion, 'shadow operation.baseVersion'),
    occurredAt: timestamp(operation.occurredAt, 'shadow operation.occurredAt'),
    payload: { examDate: payload.examDate as string | null },
  }
}

function parseRemoteEntity(value: unknown, label: string) {
  const entity = record(value, label)
  const deletedAt = entity.deletedAt === null ? null : timestamp(entity.deletedAt, `${label}.deletedAt`)
  return {
    entityKind: stringValue(entity.entityKind, `${label}.entityKind`),
    entityId: stringValue(entity.entityId, `${label}.entityId`),
    version: integer(entity.version, `${label}.version`),
    cursor: integer(entity.cursor, `${label}.cursor`),
    payload: entity.payload,
    deletedAt,
    updatedAt: timestamp(entity.updatedAt, `${label}.updatedAt`),
  }
}

export function parseTrackerSyncCapabilities(value: unknown): TrackerSyncCapabilities {
  const result = record(value, 'capabilities')
  const allowedEntityKinds = result.allowedEntityKinds
  if (!Array.isArray(allowedEntityKinds) || allowedEntityKinds.some((item) => typeof item !== 'string')) {
    throw new Error('capabilities.allowedEntityKinds must be a string array.')
  }
  if (result.product !== 'tracker' || result.schemaVersion !== 1 || result.protocolVersion !== 1) {
    throw new Error('Tracker sync protocol is not supported.')
  }
  return {
    product: 'tracker',
    schemaVersion: 1,
    protocolVersion: 1,
    enabled: booleanValue(result.enabled, 'capabilities.enabled'),
    accountEpoch: integer(result.accountEpoch, 'capabilities.accountEpoch'),
    currentCursor: integer(result.currentCursor, 'capabilities.currentCursor'),
    allowedEntityKinds: [...allowedEntityKinds] as string[],
    maxBatchSize: integer(result.maxBatchSize, 'capabilities.maxBatchSize'),
    maxPayloadBytes: integer(result.maxPayloadBytes, 'capabilities.maxPayloadBytes'),
    selectiveContentCloudV1: result.selectiveContentCloudV1 === undefined
      ? false
      : booleanValue(result.selectiveContentCloudV1, 'capabilities.selectiveContentCloudV1'),
    selectiveContentCloudEnabled: result.selectiveContentCloudEnabled === undefined
      ? false
      : booleanValue(result.selectiveContentCloudEnabled, 'capabilities.selectiveContentCloudEnabled'),
    contentQuota: parseContentQuota(result.contentQuota),
  }
}

export function parseTrackerSyncApplyResult(value: unknown): TrackerSyncApplyResult {
  const result = record(value, 'apply result')
  if (!['applied', 'replayed', 'disabled', 'epoch_mismatch', 'snapshot_required'].includes(String(result.status))) {
    throw new Error('apply result.status is unsupported.')
  }
  if (!Array.isArray(result.results)) throw new Error('apply result.results must be an array.')
  return {
    status: result.status as TrackerSyncApplyResult['status'],
    requestId: stringValue(result.requestId, 'apply result.requestId'),
    requestHash: stringValue(result.requestHash, 'apply result.requestHash').toLowerCase(),
    accountEpoch: integer(result.accountEpoch, 'apply result.accountEpoch'),
    cursor: integer(result.cursor, 'apply result.cursor'),
    results: result.results.map((item, index) => {
      const entry = record(item, `apply result.results[${index}]`)
      if (!['applied', 'duplicate', 'conflict', 'rejected'].includes(String(entry.status))) {
        throw new Error(`apply result.results[${index}].status is unsupported.`)
      }
      return {
        operationId: stringValue(entry.operationId, `apply result.results[${index}].operationId`),
        entityKind: stringValue(entry.entityKind, `apply result.results[${index}].entityKind`),
        entityId: stringValue(entry.entityId, `apply result.results[${index}].entityId`),
        status: entry.status as TrackerSyncApplyResult['results'][number]['status'],
        version: integer(entry.version, `apply result.results[${index}].version`),
        cursor: integer(entry.cursor, `apply result.results[${index}].cursor`),
        reason: entry.reason === undefined || entry.reason === null
          ? null
          : stringValue(entry.reason, `apply result.results[${index}].reason`),
      }
    }),
  }
}

export function parseTrackerSyncPullResult(value: unknown): TrackerSyncPullResult {
  const result = record(value, 'pull result')
  if (!Array.isArray(result.changes)) throw new Error('pull result.changes must be an array.')
  return {
    enabled: booleanValue(result.enabled, 'pull result.enabled'),
    accountEpoch: integer(result.accountEpoch, 'pull result.accountEpoch'),
    cursor: integer(result.cursor, 'pull result.cursor'),
    nextCursor: integer(result.nextCursor, 'pull result.nextCursor'),
    hasMore: booleanValue(result.hasMore, 'pull result.hasMore'),
    changes: result.changes.map((item, index) => parseRemoteEntity(item, `pull result.changes[${index}]`)),
  }
}

export function parseTrackerSyncSnapshotResult(value: unknown): TrackerSyncSnapshotResult {
  const result = record(value, 'snapshot result')
  if (!Array.isArray(result.entities)) throw new Error('snapshot result.entities must be an array.')
  return {
    enabled: booleanValue(result.enabled, 'snapshot result.enabled'),
    accountEpoch: integer(result.accountEpoch, 'snapshot result.accountEpoch'),
    cursor: integer(result.cursor, 'snapshot result.cursor'),
    generatedAt: timestamp(result.generatedAt, 'snapshot result.generatedAt'),
    snapshotHash: stringValue(result.snapshotHash, 'snapshot result.snapshotHash'),
    entities: result.entities.map((item, index) => parseRemoteEntity(item, `snapshot result.entities[${index}]`)),
  }
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForStableJson)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortForStableJson(value[key])]),
  )
}

export function stableTrackerSyncJson(value: unknown): string {
  return JSON.stringify(sortForStableJson(value))
}

export async function trackerSyncSha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableTrackerSyncJson(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function assertShadowRemoteEntity(value: TrackerSyncPullResult['changes'][number]): void {
  if (value.entityKind !== TRACKER_SHADOW_SYNC_ENTITY_KIND || value.entityId !== TRACKER_SHADOW_SYNC_ENTITY_ID) {
    throw new Error('Shadow pull returned an entity outside the exam-date pilot.')
  }
  if (value.deletedAt !== null) return
  const payload = record(value.payload, 'remote tracker_preferences payload')
  if (Object.keys(payload).some((key) => key !== 'examDate')) {
    throw new Error('Remote tracker_preferences payload contains unsupported fields.')
  }
  if (payload.examDate !== null && !isLocalDate(payload.examDate)) {
    throw new Error('Remote examDate must be a local date or null.')
  }
}
