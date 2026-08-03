import type {
  DailyCheckinAward,
  DiaryEntry,
  PlanExecution,
  PracticeRecord,
  Settings,
  StudyPlan,
  TimerRecord,
  WordRecord,
} from '@/lib/types'

export const TRACKER_SYNC_SCHEMA_VERSION = 1 as const

/**
 * Operational rows can expire because they are only transport metadata. User
 * learning records never expire automatically under this policy.
 */
export const TRACKER_SYNC_RETENTION = {
  successfulReceiptsDays: 7,
  diagnosticReceiptsDays: 30,
  softDeletedPayloadDays: 30,
  inactiveDeviceDays: 90,
  tombstoneEligibilityDays: 180,
} as const

/**
 * Batches stay deliberately small enough for quick mobile retries. The client
 * compacts repeated edits before applying these limits.
 */
export const TRACKER_SYNC_BATCH_LIMITS = {
  maxOperations: 50,
  maxBytes: 64 * 1024,
  // Leave room for the batch, account and device envelope.
  maxEntityBytes: 60 * 1024,
} as const

export type TrackerSyncEntityKind =
  | 'word_record'
  | 'practice_record'
  | 'timer_record'
  | 'study_plan'
  | 'plan_execution'
  | 'diary_entry'
  | 'daily_checkin'
  | 'tracker_preferences'
  | 'account_checkpoint'

export type TrackerSyncWordPayload = Omit<WordRecord, 'id'>
export type TrackerSyncPracticePayload = Omit<PracticeRecord, 'id' | 'updatedAt'>
export type TrackerSyncTimerPayload = Omit<TimerRecord, 'id' | 'updatedAt'>
export type TrackerSyncPlanPayload = Omit<StudyPlan, 'id' | 'updatedAt'>
export type TrackerSyncPlanExecutionPayload = Omit<PlanExecution, 'id' | 'updatedAt'>
export type TrackerSyncDiaryPayload = Omit<DiaryEntry, 'id'>
export type TrackerSyncDailyCheckinPayload = Omit<DailyCheckinAward, 'id'>

/** Theme and display switches remain device-local. */
export interface TrackerSyncPreferencesPayload {
  examDate?: string
}

export type CompactLegacyActivityDeltas = Record<string, Array<[day: number, delta: number]>>

/**
 * One long-lived row preserves irreversible historical state without syncing
 * the full shadow ledger or duplicating every derived projection.
 */
export interface TrackerAccountCheckpoint {
  id: 'account'
  xpAdjustment: number
  longestStreakFloor: number
  unlockedBadges: string[]
  legacyActivityDeltasByMonth?: CompactLegacyActivityDeltas
}

export interface TrackerSyncSourceByKind {
  word_record: WordRecord
  practice_record: PracticeRecord
  timer_record: TimerRecord
  study_plan: StudyPlan
  plan_execution: PlanExecution
  diary_entry: DiaryEntry
  daily_checkin: DailyCheckinAward
  tracker_preferences: Settings
  account_checkpoint: TrackerAccountCheckpoint
}

export interface TrackerSyncPayloadByKind {
  word_record: TrackerSyncWordPayload
  practice_record: TrackerSyncPracticePayload
  timer_record: TrackerSyncTimerPayload
  study_plan: TrackerSyncPlanPayload
  plan_execution: TrackerSyncPlanExecutionPayload
  diary_entry: TrackerSyncDiaryPayload
  daily_checkin: TrackerSyncDailyCheckinPayload
  tracker_preferences: TrackerSyncPreferencesPayload
  account_checkpoint: Omit<TrackerAccountCheckpoint, 'id'>
}

interface TrackerSyncOperationBase {
  schemaVersion: typeof TRACKER_SYNC_SCHEMA_VERSION
  operationId: string
  entityKind: TrackerSyncEntityKind
  entityId: string
  localSequence: number
  baseVersion: number | null
  occurredAt: string
}

export interface TrackerSyncUpsertOperation<
  K extends TrackerSyncEntityKind = TrackerSyncEntityKind,
> extends TrackerSyncOperationBase {
  entityKind: K
  action: 'upsert'
  payload: TrackerSyncPayloadByKind[K]
  /** A deleted cloud row can only be restored after an explicit local choice. */
  restoreDeleted?: true
}

export interface TrackerSyncDeleteOperation extends TrackerSyncOperationBase {
  action: 'delete'
}

export type AnyTrackerSyncUpsertOperation = {
  [K in TrackerSyncEntityKind]: TrackerSyncUpsertOperation<K>
}[TrackerSyncEntityKind]

export type TrackerSyncOperation = AnyTrackerSyncUpsertOperation | TrackerSyncDeleteOperation

export interface TrackerSyncBatch {
  schemaVersion: typeof TRACKER_SYNC_SCHEMA_VERSION
  batchId: string
  accountEpoch: string
  deviceId: string
  sealedAt: string
  operations: readonly TrackerSyncOperation[]
}

export interface TrackerSyncBatchLimits {
  maxOperations: number
  maxBytes: number
  maxEntityBytes: number
}

export interface CreateTrackerSyncUpsertInput<K extends TrackerSyncEntityKind> {
  operationId: string
  entityKind: K
  entityId: string
  localSequence: number
  source: TrackerSyncSourceByKind[K]
  baseVersion: number | null
  occurredAt: string
  restoreDeleted?: true
}

export interface CreateTrackerSyncDeleteInput {
  operationId: string
  entityKind: TrackerSyncEntityKind
  entityId: string
  localSequence: number
  baseVersion: number | null
  occurredAt: string
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

function assertIdentifier(label: string, value: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty.`)
}

function assertBaseVersion(value: number | null): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error('baseVersion must be null or a non-negative safe integer.')
  }
}

function assertLocalSequence(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('localSequence must be a positive safe integer.')
  }
}

function assertTimestamp(label: string, value: string): void {
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp.`)
  }
}

export function estimateTrackerSyncBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function createTrackerSyncPayload<K extends TrackerSyncEntityKind>(
  entityKind: K,
  source: TrackerSyncSourceByKind[K],
): TrackerSyncPayloadByKind[K] {
  let payload: TrackerSyncPayloadByKind[TrackerSyncEntityKind]

  switch (entityKind) {
    case 'word_record': {
      const value = source as WordRecord
      payload = withoutUndefined({
        date: value.date,
        category: value.category,
        subCategory: value.subCategory,
        count: value.count,
        note: value.note,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })
      break
    }
    case 'practice_record': {
      const value = source as PracticeRecord
      payload = withoutUndefined({
        type: value.type,
        date: value.date,
        topic: value.topic,
        duration: value.duration,
        score: value.score,
        note: value.note,
        createdAt: value.createdAt,
      })
      break
    }
    case 'timer_record': {
      const value = source as TimerRecord
      payload = withoutUndefined({
        subject: value.subject,
        date: value.date,
        duration: value.duration,
        note: value.note,
        createdAt: value.createdAt,
      })
      break
    }
    case 'study_plan': {
      const value = source as StudyPlan
      payload = withoutUndefined({
        title: value.title,
        description: value.description,
        category: value.category,
        frequency: value.frequency,
        weekDays: value.weekDays ? [...value.weekDays] : undefined,
        targetTime: value.targetTime,
        targetDuration: value.targetDuration,
        targetCount: value.targetCount,
        isActive: value.isActive,
        createdAt: value.createdAt,
      })
      break
    }
    case 'plan_execution': {
      const value = source as PlanExecution
      payload = withoutUndefined({
        planId: value.planId,
        date: value.date,
        isCompleted: value.isCompleted,
        actualDuration: value.actualDuration,
        actualCount: value.actualCount,
        note: value.note,
      })
      break
    }
    case 'diary_entry': {
      const value = source as DiaryEntry
      payload = withoutUndefined({
        date: value.date,
        mood: value.mood,
        content: value.content,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
      })
      break
    }
    case 'daily_checkin': {
      const value = source as DailyCheckinAward
      payload = withoutUndefined({
        date: value.date,
        awardedXP: value.awardedXP,
        awardedAt: value.awardedAt,
        source: value.source,
        sourceEntityId: value.sourceEntityId,
      })
      break
    }
    case 'tracker_preferences': {
      const value = source as Settings
      payload = withoutUndefined({
        examDate: value.examDate,
      })
      break
    }
    case 'account_checkpoint': {
      const value = source as TrackerAccountCheckpoint
      payload = withoutUndefined({
        xpAdjustment: value.xpAdjustment,
        longestStreakFloor: value.longestStreakFloor,
        unlockedBadges: [...new Set(value.unlockedBadges)].sort(),
        legacyActivityDeltasByMonth: value.legacyActivityDeltasByMonth
          ? Object.fromEntries(Object.entries(value.legacyActivityDeltasByMonth).map(
              ([month, deltas]) => [month, deltas.map(([day, delta]) => [day, delta])],
            ))
          : undefined,
      })
      break
    }
  }

  return payload as TrackerSyncPayloadByKind[K]
}

export function createTrackerSyncUpsert<K extends TrackerSyncEntityKind>(
  input: CreateTrackerSyncUpsertInput<K>,
  limits: Pick<TrackerSyncBatchLimits, 'maxEntityBytes'> = TRACKER_SYNC_BATCH_LIMITS,
): TrackerSyncUpsertOperation<K> {
  assertIdentifier('operationId', input.operationId)
  assertIdentifier('entityId', input.entityId)
  assertLocalSequence(input.localSequence)
  assertBaseVersion(input.baseVersion)
  assertTimestamp('occurredAt', input.occurredAt)

  const operation = withoutUndefined({
    schemaVersion: TRACKER_SYNC_SCHEMA_VERSION,
    operationId: input.operationId,
    entityKind: input.entityKind,
    entityId: input.entityId,
    localSequence: input.localSequence,
    action: 'upsert' as const,
    baseVersion: input.baseVersion,
    occurredAt: input.occurredAt,
    payload: createTrackerSyncPayload(input.entityKind, input.source),
    restoreDeleted: input.restoreDeleted,
  }) as TrackerSyncUpsertOperation<K>

  if (estimateTrackerSyncBytes(operation) > limits.maxEntityBytes) {
    throw new Error('Tracker sync entity exceeds the per-entity byte limit.')
  }

  return operation
}

export function createTrackerSyncDelete(
  input: CreateTrackerSyncDeleteInput,
): TrackerSyncDeleteOperation {
  assertIdentifier('operationId', input.operationId)
  assertIdentifier('entityId', input.entityId)
  assertLocalSequence(input.localSequence)
  assertBaseVersion(input.baseVersion)
  assertTimestamp('occurredAt', input.occurredAt)

  return {
    schemaVersion: TRACKER_SYNC_SCHEMA_VERSION,
    operationId: input.operationId,
    entityKind: input.entityKind,
    entityId: input.entityId,
    localSequence: input.localSequence,
    action: 'delete',
    baseVersion: input.baseVersion,
    occurredAt: input.occurredAt,
  }
}

function operationKey(operation: TrackerSyncOperation): string {
  return `${operation.entityKind}:${operation.entityId}`
}

/**
 * Keeps only the last pending mutation for each entity. A record that was
 * created and deleted before its first upload disappears from the queue.
 */
export function compactTrackerSyncOperations(
  operations: readonly TrackerSyncOperation[],
): TrackerSyncOperation[] {
  const compacted = new Map<string, TrackerSyncOperation>()
  let previousSequence = 0

  for (const operation of operations) {
    if (operation.localSequence <= previousSequence) {
      throw new Error('Tracker sync operations must be ordered by localSequence.')
    }
    previousSequence = operation.localSequence

    const key = operationKey(operation)
    const previous = compacted.get(key)
    if (!previous) {
      compacted.set(key, operation)
      continue
    }

    if (
      previous.action === 'upsert'
      && previous.baseVersion === null
      && operation.action === 'delete'
      && operation.baseVersion === null
    ) {
      compacted.delete(key)
      continue
    }

    if (
      previous.action === 'delete'
      && operation.action === 'upsert'
      && operation.restoreDeleted !== true
    ) {
      throw new Error('Restoring a deleted cloud entity requires explicit consent.')
    }

    compacted.set(key, {
      ...operation,
      baseVersion: previous.baseVersion ?? operation.baseVersion,
    } as TrackerSyncOperation)
  }

  return [...compacted.values()].sort((left, right) => left.localSequence - right.localSequence)
}

/** Splits an already compacted queue without changing operation order. */
export function partitionTrackerSyncOperations(
  operations: readonly TrackerSyncOperation[],
  limits: TrackerSyncBatchLimits = TRACKER_SYNC_BATCH_LIMITS,
): TrackerSyncOperation[][] {
  if (limits.maxOperations < 1 || limits.maxBytes < 1 || limits.maxEntityBytes < 1) {
    throw new Error('Tracker sync batch limits must be positive.')
  }

  const batches: TrackerSyncOperation[][] = []
  let current: TrackerSyncOperation[] = []

  for (const operation of operations) {
    if (estimateTrackerSyncBytes(operation) > limits.maxEntityBytes) {
      throw new Error('Tracker sync entity exceeds the per-entity byte limit.')
    }

    const candidate = [...current, operation]
    // Reserve a small fixed envelope budget for batch/account/device ids.
    const candidateBytes = estimateTrackerSyncBytes({ operations: candidate }) + 512
    if (current.length > 0 && (
      candidate.length > limits.maxOperations
      || candidateBytes > limits.maxBytes
    )) {
      batches.push(current)
      current = [operation]
    } else {
      current = candidate
    }

    if (estimateTrackerSyncBytes({ operations: current }) + 512 > limits.maxBytes) {
      throw new Error('Tracker sync operation cannot fit inside an empty batch.')
    }
  }

  if (current.length > 0) batches.push(current)
  return batches
}

function cloneOperations(operations: readonly TrackerSyncOperation[]): TrackerSyncOperation[] {
  return JSON.parse(JSON.stringify(operations)) as TrackerSyncOperation[]
}

/**
 * A sealed batch is immutable in meaning: retries reuse the same batch and
 * operation ids instead of regenerating them.
 */
export function sealTrackerSyncBatch(input: {
  batchId: string
  accountEpoch: string
  deviceId: string
  sealedAt: string
  operations: readonly TrackerSyncOperation[]
}, limits: TrackerSyncBatchLimits = TRACKER_SYNC_BATCH_LIMITS): TrackerSyncBatch {
  assertIdentifier('batchId', input.batchId)
  assertIdentifier('accountEpoch', input.accountEpoch)
  assertIdentifier('deviceId', input.deviceId)
  assertTimestamp('sealedAt', input.sealedAt)
  if (input.operations.length === 0) throw new Error('A sync batch must contain operations.')
  if (input.operations.length > limits.maxOperations) {
    throw new Error('Tracker sync batch exceeds the operation count limit.')
  }

  const batch = {
    schemaVersion: TRACKER_SYNC_SCHEMA_VERSION,
    batchId: input.batchId,
    accountEpoch: input.accountEpoch,
    deviceId: input.deviceId,
    sealedAt: input.sealedAt,
    operations: Object.freeze(cloneOperations(input.operations)),
  }
  if (estimateTrackerSyncBytes(batch) > limits.maxBytes) {
    throw new Error('Tracker sync batch exceeds the byte limit.')
  }

  return Object.freeze(batch)
}
