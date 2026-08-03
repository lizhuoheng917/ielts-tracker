import { isLocalDate } from '@/lib/localDate'
import type {
  PlanExecution,
  PracticeRecord,
  StudyPlan,
  TimerRecord,
} from '@/lib/types'

export const TRACKER_PHASE4B_ENTITY_KINDS = [
  'study_plan',
  'plan_execution',
  'practice_record',
  'timer_record',
] as const

export const TRACKER_PHASE4B_EXECUTION_KEY_SEPARATOR = '\u001f'

export type TrackerPhase4bEntityKind = (typeof TRACKER_PHASE4B_ENTITY_KINDS)[number]

export const TRACKER_PHASE4B_UTF8_LIMITS = {
  identifier: 256,
  title: 256,
  description: 4 * 1024,
  topic: 512,
  note: 4 * 1024,
  payload: {
    study_plan: 8 * 1024,
    plan_execution: 8 * 1024,
    practice_record: 8 * 1024,
    timer_record: 8 * 1024,
  },
} as const

export const TRACKER_PHASE4B_NUMERIC_LIMITS = {
  planDuration: 1_000_000,
  count: 1_000_000_000,
  executionDuration: 1_000_000,
  practiceDuration: 1_000_000,
  timerDuration: 1_000_000_000,
} as const

export type TrackerPhase4bPlanPayload = Omit<StudyPlan, 'id' | 'updatedAt'>
export type TrackerPhase4bExecutionPayload = Omit<PlanExecution, 'id' | 'updatedAt'>
export type TrackerPhase4bPracticePayload = Omit<PracticeRecord, 'id' | 'updatedAt'>
export type TrackerPhase4bTimerPayload = Omit<TimerRecord, 'id' | 'updatedAt'>

export interface TrackerPhase4bPayloadByKind {
  study_plan: TrackerPhase4bPlanPayload
  plan_execution: TrackerPhase4bExecutionPayload
  practice_record: TrackerPhase4bPracticePayload
  timer_record: TrackerPhase4bTimerPayload
}

export interface TrackerPhase4bSourceByKind {
  study_plan: StudyPlan
  plan_execution: PlanExecution
  practice_record: PracticeRecord
  timer_record: TimerRecord
}

export interface TrackerPhase4bLocalSnapshot {
  studyPlans: StudyPlan[]
  planExecutions: PlanExecution[]
  practiceRecords: PracticeRecord[]
  timerRecords: TimerRecord[]
}

export interface TrackerPhase4bQuarantinedRecord {
  entityKind: TrackerPhase4bEntityKind
  index: number
  entityId?: string
  reason: string
}

export interface TrackerPhase4bLocalSnapshotInspection {
  snapshot: TrackerPhase4bLocalSnapshot
  quarantined: TrackerPhase4bQuarantinedRecord[]
}

export type AnyTrackerPhase4bPayload = {
  [K in TrackerPhase4bEntityKind]: TrackerPhase4bPayloadByKind[K]
}[TrackerPhase4bEntityKind]

export type TrackerPhase4bLocalEntity = {
  [K in TrackerPhase4bEntityKind]: {
    entityKind: K
    entityId: string
    semanticKey: string
    payload: TrackerPhase4bPayloadByKind[K]
    /** Legacy PlanExecution rows use the supplied durable observation time. */
    updatedAt: string
    updatedAtSource: 'record' | 'observed'
  }
}[TrackerPhase4bEntityKind]

export type TrackerPhase4bRemoteEntity = {
  [K in TrackerPhase4bEntityKind]: {
    entityKind: K
    entityId: string
    semanticKey: string
    version: number
    cursor: number
    payload: TrackerPhase4bPayloadByKind[K] | null
    deletedAt: string | null
    updatedAt: string
  }
}[TrackerPhase4bEntityKind]

export interface TrackerPhase4bOperationIntent {
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  action: 'upsert' | 'delete'
  /** The deployed RPC uses numeric zero for a record that has no cloud row. */
  baseVersion: number
  occurredAt: string
  payload?: AnyTrackerPhase4bPayload
}

export interface TrackerPhase4bRestoreRequired {
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  reason: 'cloud_tombstone_requires_explicit_restore'
}

export interface TrackerPhase4bLocalDiff {
  operations: TrackerPhase4bOperationIntent[]
  restoreRequired: TrackerPhase4bRestoreRequired[]
}

export interface TrackerPhase4bRemoteCanonicalization {
  entities: TrackerPhase4bRemoteEntity[]
  cleanupOperations: TrackerPhase4bOperationIntent[]
}

export interface TrackerPhase4bRemoteMerge extends TrackerPhase4bRemoteCanonicalization {
  /** Physical rows present in the previous baseline but absent from an authoritative snapshot. */
  physicallyRemoved: TrackerPhase4bRemoteEntity[]
}

export type TrackerPhase4bReconciliationAction =
  | 'none'
  | 'accept_remote'
  | 'upload_upsert'
  | 'upload_delete'
  | 'install_remote_upsert'
  | 'install_remote_delete'
  | 'restore_choice'
  | 'snapshot_required'

export interface TrackerPhase4bReconciliationPlan {
  action: TrackerPhase4bReconciliationAction
  reason:
    | 'unchanged'
    | 'same_value'
    | 'local_only_change'
    | 'remote_only_change'
    | 'local_lww'
    | 'remote_lww'
    | 'cloud_tombstone_requires_explicit_restore'
    | 'baseline_entity_disappeared'
  operation?: TrackerPhase4bOperationIntent
  remote?: TrackerPhase4bRemoteEntity
}

export type TrackerPhase4bLocalReconciliationState =
  | { entity: TrackerPhase4bLocalEntity; deletedAt?: never }
  | { entity: null; deletedAt?: string }

type UnknownRecord = Record<string, unknown>

const PLAN_CATEGORIES = new Set([
  'reading',
  'listening',
  'writing',
  'speaking',
  'vocabulary',
  'general',
])
const PLAN_FREQUENCIES = new Set(['daily', 'weekly', 'custom'])
const PRACTICE_TYPES = new Set(['reading', 'listening', 'writing', 'speaking'])
const TIMER_SUBJECTS = new Set(['reading', 'listening', 'writing', 'speaking', 'general'])
const TARGET_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export class TrackerPhase4bValidationError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'TrackerPhase4bValidationError'
    this.path = path
  }
}

function fail(path: string, message: string): never {
  throw new TrackerPhase4bValidationError(path, message)
}

export function trackerPhase4bUtf8Bytes(value: unknown): number {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  return new TextEncoder().encode(serialized).byteLength
}

function record(value: unknown, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object')
  }
  return value as UnknownRecord
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array')
  return value
}

function exactKeys(value: UnknownRecord, allowedKeys: readonly string[], path: string): void {
  const allowed = new Set(allowedKeys)
  const unsupported = Object.keys(value).filter((key) => !allowed.has(key))
  if (unsupported.length > 0) fail(path, `contains unsupported field ${unsupported[0]}`)
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'must be a string')
  return value
}

function boundedString(
  value: unknown,
  path: string,
  maxBytes: number,
  options: { allowEmpty?: boolean } = {},
): string {
  const parsed = stringValue(value, path)
  if (!options.allowEmpty && parsed.trim().length === 0) fail(path, 'must not be empty')
  if (trackerPhase4bUtf8Bytes(parsed) > maxBytes) {
    fail(path, `exceeds ${maxBytes} UTF-8 bytes`)
  }
  return parsed
}

function identifier(value: unknown, path: string): string {
  const parsed = boundedString(value, path, TRACKER_PHASE4B_UTF8_LIMITS.identifier)
  if (parsed.trim() !== parsed) fail(path, 'must not have leading or trailing whitespace')
  if ([...parsed].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })) fail(path, 'must not contain control characters')
  return parsed
}

function optionalText(
  object: UnknownRecord,
  key: string,
  path: string,
  maxBytes: number,
): string | undefined {
  const value = object[key]
  if (value === undefined) return undefined
  const parsed = boundedString(value, `${path}.${key}`, maxBytes, { allowEmpty: true })
  return parsed.trim().length === 0 ? undefined : parsed
}

function finiteNonNegative(value: unknown, path: string): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || value < 0
    || value > Number.MAX_SAFE_INTEGER
  ) {
    fail(path, 'must be a finite non-negative safe number')
  }
  return value
}

function boundedNonNegative(value: unknown, path: string, maximum: number): number {
  const parsed = finiteNonNegative(value, path)
  if (parsed > maximum) fail(path, `must be at most ${maximum}`)
  return parsed
}

function optionalFiniteNonNegative(
  object: UnknownRecord,
  key: string,
  path: string,
): number | undefined {
  return object[key] === undefined
    ? undefined
    : finiteNonNegative(object[key], `${path}.${key}`)
}

function optionalBoundedNonNegative(
  object: UnknownRecord,
  key: string,
  path: string,
  maximum: number,
): number | undefined {
  return object[key] === undefined
    ? undefined
    : boundedNonNegative(object[key], `${path}.${key}`, maximum)
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean')
  return value
}

function localDate(value: unknown, path: string): string {
  if (!isLocalDate(value)) fail(path, 'must be a real local date in YYYY-MM-DD form')
  return value
}

function timestamp(value: unknown, path: string): string {
  const parsed = stringValue(value, path)
  if (!parsed || !Number.isFinite(Date.parse(parsed))) fail(path, 'must be a valid timestamp')
  return parsed
}

function enumValue<T extends string>(value: unknown, values: Set<string>, path: string): T {
  if (typeof value !== 'string' || !values.has(value)) fail(path, 'has an unsupported value')
  return value as T
}

function optionalWeekDays(object: UnknownRecord, path: string): number[] | undefined {
  if (object.weekDays === undefined) return undefined
  const values = array(object.weekDays, `${path}.weekDays`).map((value, index) => {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 6) {
      fail(`${path}.weekDays[${index}]`, 'must be an integer from 0 to 6')
    }
    return value as number
  })
  return [...new Set(values)].sort((left, right) => left - right)
}

function withoutUndefined<T extends UnknownRecord>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as T
}

function assertPayloadBytes<K extends TrackerPhase4bEntityKind>(
  entityKind: K,
  payload: TrackerPhase4bPayloadByKind[K],
  path: string,
): void {
  const maximum = TRACKER_PHASE4B_UTF8_LIMITS.payload[entityKind]
  if (trackerPhase4bUtf8Bytes(payload) > maximum) {
    fail(path, `exceeds ${maximum} serialized UTF-8 bytes`)
  }
}

function parseStudyPlan(
  value: unknown,
  path: string,
  payloadOnly: boolean,
): StudyPlan | TrackerPhase4bPlanPayload {
  const object = record(value, path)
  exactKeys(object, [
    ...(payloadOnly ? [] : ['id']),
    'title',
    'description',
    'category',
    'frequency',
    'weekDays',
    'targetTime',
    'targetDuration',
    'targetCount',
    'isActive',
    'createdAt',
    ...(payloadOnly ? [] : ['updatedAt']),
  ], path)
  const targetTime = object.targetTime === undefined
    ? undefined
    : boundedString(object.targetTime, `${path}.targetTime`, 5)
  if (targetTime !== undefined && !TARGET_TIME_PATTERN.test(targetTime)) {
    fail(`${path}.targetTime`, 'must be HH:mm')
  }
  const parsed = withoutUndefined({
    ...(payloadOnly ? {} : { id: identifier(object.id, `${path}.id`) }),
    title: boundedString(object.title, `${path}.title`, TRACKER_PHASE4B_UTF8_LIMITS.title),
    description: optionalText(
      object,
      'description',
      path,
      TRACKER_PHASE4B_UTF8_LIMITS.description,
    ),
    category: enumValue<StudyPlan['category']>(object.category, PLAN_CATEGORIES, `${path}.category`),
    frequency: enumValue<StudyPlan['frequency']>(object.frequency, PLAN_FREQUENCIES, `${path}.frequency`),
    weekDays: optionalWeekDays(object, path),
    targetTime,
    targetDuration: optionalBoundedNonNegative(
      object,
      'targetDuration',
      path,
      TRACKER_PHASE4B_NUMERIC_LIMITS.planDuration,
    ),
    targetCount: optionalBoundedNonNegative(
      object,
      'targetCount',
      path,
      TRACKER_PHASE4B_NUMERIC_LIMITS.count,
    ),
    isActive: booleanValue(object.isActive, `${path}.isActive`),
    createdAt: timestamp(object.createdAt, `${path}.createdAt`),
    ...(payloadOnly ? {} : { updatedAt: timestamp(object.updatedAt, `${path}.updatedAt`) }),
  })
  if (payloadOnly) assertPayloadBytes('study_plan', parsed as TrackerPhase4bPlanPayload, path)
  return parsed as StudyPlan | TrackerPhase4bPlanPayload
}

function parsePlanExecution(
  value: unknown,
  path: string,
  payloadOnly: boolean,
): PlanExecution | TrackerPhase4bExecutionPayload {
  const object = record(value, path)
  exactKeys(object, [
    ...(payloadOnly ? [] : ['id']),
    'planId',
    'date',
    'isCompleted',
    'actualDuration',
    'actualCount',
    'note',
    ...(payloadOnly ? [] : ['updatedAt']),
  ], path)
  const parsed = withoutUndefined({
    ...(payloadOnly ? {} : { id: identifier(object.id, `${path}.id`) }),
    planId: identifier(object.planId, `${path}.planId`),
    date: localDate(object.date, `${path}.date`),
    isCompleted: booleanValue(object.isCompleted, `${path}.isCompleted`),
    actualDuration: optionalBoundedNonNegative(
      object,
      'actualDuration',
      path,
      TRACKER_PHASE4B_NUMERIC_LIMITS.executionDuration,
    ),
    actualCount: optionalBoundedNonNegative(
      object,
      'actualCount',
      path,
      TRACKER_PHASE4B_NUMERIC_LIMITS.count,
    ),
    note: optionalText(object, 'note', path, TRACKER_PHASE4B_UTF8_LIMITS.note),
    ...(payloadOnly || object.updatedAt === undefined
      ? {}
      : { updatedAt: timestamp(object.updatedAt, `${path}.updatedAt`) }),
  })
  if (payloadOnly) {
    assertPayloadBytes('plan_execution', parsed as TrackerPhase4bExecutionPayload, path)
  }
  return parsed as PlanExecution | TrackerPhase4bExecutionPayload
}

function parsePracticeRecord(
  value: unknown,
  path: string,
  payloadOnly: boolean,
): PracticeRecord | TrackerPhase4bPracticePayload {
  const object = record(value, path)
  exactKeys(object, [
    ...(payloadOnly ? [] : ['id']),
    'type',
    'date',
    'topic',
    'duration',
    'score',
    'note',
    'createdAt',
    ...(payloadOnly ? [] : ['updatedAt']),
  ], path)
  const score = optionalFiniteNonNegative(object, 'score', path)
  if (score !== undefined && score > 9) fail(`${path}.score`, 'must be from 0 to 9')
  const parsed = withoutUndefined({
    ...(payloadOnly ? {} : { id: identifier(object.id, `${path}.id`) }),
    type: enumValue<PracticeRecord['type']>(object.type, PRACTICE_TYPES, `${path}.type`),
    date: localDate(object.date, `${path}.date`),
    topic: optionalText(object, 'topic', path, TRACKER_PHASE4B_UTF8_LIMITS.topic),
    duration: boundedNonNegative(
      object.duration,
      `${path}.duration`,
      TRACKER_PHASE4B_NUMERIC_LIMITS.practiceDuration,
    ),
    // Zero is the existing local representation of "not scored" and does not
    // need a JSONB field of its own.
    score: score === 0 ? undefined : score,
    note: optionalText(object, 'note', path, TRACKER_PHASE4B_UTF8_LIMITS.note),
    createdAt: timestamp(object.createdAt, `${path}.createdAt`),
    ...(payloadOnly ? {} : { updatedAt: timestamp(object.updatedAt, `${path}.updatedAt`) }),
  })
  if (payloadOnly) assertPayloadBytes('practice_record', parsed as TrackerPhase4bPracticePayload, path)
  return parsed as PracticeRecord | TrackerPhase4bPracticePayload
}

function parseTimerRecord(
  value: unknown,
  path: string,
  payloadOnly: boolean,
): TimerRecord | TrackerPhase4bTimerPayload {
  const object = record(value, path)
  exactKeys(object, [
    ...(payloadOnly ? [] : ['id']),
    'subject',
    'date',
    'duration',
    'note',
    'createdAt',
    ...(payloadOnly ? [] : ['updatedAt']),
  ], path)
  const parsed = withoutUndefined({
    ...(payloadOnly ? {} : { id: identifier(object.id, `${path}.id`) }),
    subject: enumValue<TimerRecord['subject']>(object.subject, TIMER_SUBJECTS, `${path}.subject`),
    date: localDate(object.date, `${path}.date`),
    duration: boundedNonNegative(
      object.duration,
      `${path}.duration`,
      TRACKER_PHASE4B_NUMERIC_LIMITS.timerDuration,
    ),
    note: optionalText(object, 'note', path, TRACKER_PHASE4B_UTF8_LIMITS.note),
    createdAt: timestamp(object.createdAt, `${path}.createdAt`),
    ...(payloadOnly ? {} : { updatedAt: timestamp(object.updatedAt, `${path}.updatedAt`) }),
  })
  if (payloadOnly) assertPayloadBytes('timer_record', parsed as TrackerPhase4bTimerPayload, path)
  return parsed as TimerRecord | TrackerPhase4bTimerPayload
}

function uniqueById<T extends { id: string }>(values: T[], path: string): T[] {
  const ids = new Set<string>()
  values.forEach((value, index) => {
    if (ids.has(value.id)) fail(`${path}[${index}].id`, 'must be unique')
    ids.add(value.id)
  })
  return values
}

export function parseTrackerPhase4bLocalSnapshot(value: unknown): TrackerPhase4bLocalSnapshot {
  const object = record(value, '$')
  exactKeys(object, ['studyPlans', 'planExecutions', 'practiceRecords', 'timerRecords'], '$')
  const studyPlans = uniqueById(
    array(object.studyPlans, '$.studyPlans').map((item, index) => (
      parseStudyPlan(item, `$.studyPlans[${index}]`, false) as StudyPlan
    )),
    '$.studyPlans',
  )
  const planExecutions = uniqueById(
    array(object.planExecutions, '$.planExecutions').map((item, index) => (
      parsePlanExecution(item, `$.planExecutions[${index}]`, false) as PlanExecution
    )),
    '$.planExecutions',
  )
  const practiceRecords = uniqueById(
    array(object.practiceRecords, '$.practiceRecords').map((item, index) => (
      parsePracticeRecord(item, `$.practiceRecords[${index}]`, false) as PracticeRecord
    )),
    '$.practiceRecords',
  )
  const timerRecords = uniqueById(
    array(object.timerRecords, '$.timerRecords').map((item, index) => (
      parseTimerRecord(item, `$.timerRecords[${index}]`, false) as TimerRecord
    )),
    '$.timerRecords',
  )

  const executionKeys = new Set<string>()
  planExecutions.forEach((execution, index) => {
    const key = trackerPhase4bExecutionBusinessKey(execution)
    if (executionKeys.has(key)) {
      fail(`$.planExecutions[${index}]`, 'duplicates the planId/date business key')
    }
    executionKeys.add(key)
  })

  return { studyPlans, planExecutions, practiceRecords, timerRecords }
}

function quarantineEntityId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const id = (value as UnknownRecord).id
  if (typeof id !== 'string' || id.length === 0) return undefined
  return id
}

function validationReason(error: unknown): string {
  return error instanceof Error ? error.message : 'record failed validation'
}

/**
 * Validates local records independently. One legacy or oversized row is kept
 * on this device and reported, while every other valid row can still enter the
 * outbox. This function never truncates or rewrites the quarantined source.
 */
export function inspectTrackerPhase4bLocalSnapshot(
  value: unknown,
): TrackerPhase4bLocalSnapshotInspection {
  const object = record(value, '$')
  exactKeys(object, ['studyPlans', 'planExecutions', 'practiceRecords', 'timerRecords'], '$')
  const rawPlans = array(object.studyPlans, '$.studyPlans')
  const rawExecutions = array(object.planExecutions, '$.planExecutions')
  const rawPractices = array(object.practiceRecords, '$.practiceRecords')
  const rawTimers = array(object.timerRecords, '$.timerRecords')
  const quarantined: TrackerPhase4bQuarantinedRecord[] = []

  const parseRows = <T extends { id: string }>(input: {
    entityKind: TrackerPhase4bEntityKind
    values: unknown[]
    parse: (value: unknown, path: string) => T
  }): T[] => {
    const result: T[] = []
    const ids = new Set<string>()
    input.values.forEach((item, index) => {
      try {
        const parsed = input.parse(item, `$.${input.entityKind}[${index}]`)
        if (ids.has(parsed.id)) {
          throw new TrackerPhase4bValidationError(
            `$.${input.entityKind}[${index}].id`,
            'must be unique',
          )
        }
        ids.add(parsed.id)
        result.push(parsed)
      } catch (error) {
        quarantined.push({
          entityKind: input.entityKind,
          index,
          ...(quarantineEntityId(item) ? { entityId: quarantineEntityId(item) } : {}),
          reason: validationReason(error),
        })
      }
    })
    return result
  }

  const studyPlans = parseRows<StudyPlan>({
    entityKind: 'study_plan',
    values: rawPlans,
    parse: (item, path) => parseStudyPlan(item, path, false) as StudyPlan,
  })
  const parsedExecutions = parseRows<PlanExecution>({
    entityKind: 'plan_execution',
    values: rawExecutions,
    parse: (item, path) => parsePlanExecution(item, path, false) as PlanExecution,
  })
  const practiceRecords = parseRows<PracticeRecord>({
    entityKind: 'practice_record',
    values: rawPractices,
    parse: (item, path) => parsePracticeRecord(item, path, false) as PracticeRecord,
  })
  const timerRecords = parseRows<TimerRecord>({
    entityKind: 'timer_record',
    values: rawTimers,
    parse: (item, path) => parseTimerRecord(item, path, false) as TimerRecord,
  })

  const syncablePlanIds = new Set(studyPlans.map((plan) => plan.id))
  const executionKeys = new Set<string>()
  const planExecutions = parsedExecutions.filter((execution) => {
    const rawIndex = rawExecutions.findIndex((item) => quarantineEntityId(item) === execution.id)
    if (!syncablePlanIds.has(execution.planId)) {
      quarantined.push({
        entityKind: 'plan_execution',
        index: rawIndex,
        entityId: execution.id,
        reason: 'parent plan is not syncable',
      })
      return false
    }
    const key = trackerPhase4bExecutionBusinessKey(execution)
    if (!executionKeys.has(key)) {
      executionKeys.add(key)
      return true
    }
    quarantined.push({
      entityKind: 'plan_execution',
      index: rawIndex,
      entityId: execution.id,
      reason: 'duplicates the planId/date business key',
    })
    return false
  })

  return {
    snapshot: { studyPlans, planExecutions, practiceRecords, timerRecords },
    quarantined,
  }
}

export function parseTrackerPhase4bPayload<K extends TrackerPhase4bEntityKind>(
  entityKind: K,
  value: unknown,
  path = '$.payload',
): TrackerPhase4bPayloadByKind[K] {
  switch (entityKind) {
    case 'study_plan':
      return parseStudyPlan(value, path, true) as TrackerPhase4bPayloadByKind[K]
    case 'plan_execution':
      return parsePlanExecution(value, path, true) as TrackerPhase4bPayloadByKind[K]
    case 'practice_record':
      return parsePracticeRecord(value, path, true) as TrackerPhase4bPayloadByKind[K]
    case 'timer_record':
      return parseTimerRecord(value, path, true) as TrackerPhase4bPayloadByKind[K]
  }
}

export function createTrackerPhase4bPayload<K extends TrackerPhase4bEntityKind>(
  entityKind: K,
  source: TrackerPhase4bSourceByKind[K],
): TrackerPhase4bPayloadByKind[K] {
  switch (entityKind) {
    case 'study_plan': {
      const value = source as StudyPlan
      return parseTrackerPhase4bPayload('study_plan', {
        title: value.title,
        description: value.description,
        category: value.category,
        frequency: value.frequency,
        weekDays: value.weekDays,
        targetTime: value.targetTime,
        targetDuration: value.targetDuration,
        targetCount: value.targetCount,
        isActive: value.isActive,
        createdAt: value.createdAt,
      }) as TrackerPhase4bPayloadByKind[K]
    }
    case 'plan_execution': {
      const value = source as PlanExecution
      return parseTrackerPhase4bPayload('plan_execution', {
        planId: value.planId,
        date: value.date,
        isCompleted: value.isCompleted,
        actualDuration: value.actualDuration,
        actualCount: value.actualCount,
        note: value.note,
      }) as TrackerPhase4bPayloadByKind[K]
    }
    case 'practice_record': {
      const value = source as PracticeRecord
      return parseTrackerPhase4bPayload('practice_record', {
        type: value.type,
        date: value.date,
        topic: value.topic,
        duration: value.duration,
        score: value.score,
        note: value.note,
        createdAt: value.createdAt,
      }) as TrackerPhase4bPayloadByKind[K]
    }
    case 'timer_record': {
      const value = source as TimerRecord
      return parseTrackerPhase4bPayload('timer_record', {
        subject: value.subject,
        date: value.date,
        duration: value.duration,
        note: value.note,
        createdAt: value.createdAt,
      }) as TrackerPhase4bPayloadByKind[K]
    }
  }
}

export function trackerPhase4bExecutionBusinessKey(
  value: Pick<PlanExecution, 'planId' | 'date'>,
): string {
  return `${value.planId}${TRACKER_PHASE4B_EXECUTION_KEY_SEPARATOR}${value.date}`
}

function defaultSemanticKey(entityKind: TrackerPhase4bEntityKind, entityId: string): string {
  return `${entityKind}\u0000${entityId}`
}

function executionSemanticKey(payload: TrackerPhase4bExecutionPayload): string {
  return `plan_execution\u0000${trackerPhase4bExecutionBusinessKey(payload)}`
}

function phase4bEntityKey(value: {
  entityKind: TrackerPhase4bEntityKind
  entityId: string
  semanticKey?: string
}): string {
  return value.semanticKey ?? defaultSemanticKey(value.entityKind, value.entityId)
}

function compareEntity(left: TrackerPhase4bLocalEntity, right: TrackerPhase4bLocalEntity): number {
  return phase4bEntityKey(left).localeCompare(phase4bEntityKey(right))
}

export function materializeTrackerPhase4bLocalEntities(
  snapshot: TrackerPhase4bLocalSnapshot,
  executionObservedAt: string,
): TrackerPhase4bLocalEntity[] {
  const observedAt = timestamp(executionObservedAt, '$.executionObservedAt')
  return [
    ...snapshot.studyPlans.map((source) => ({
      entityKind: 'study_plan' as const,
      entityId: source.id,
      semanticKey: defaultSemanticKey('study_plan', source.id),
      payload: createTrackerPhase4bPayload('study_plan', source),
      updatedAt: source.updatedAt,
      updatedAtSource: 'record' as const,
    })),
    ...snapshot.planExecutions.map((source) => {
      const payload = createTrackerPhase4bPayload('plan_execution', source)
      return {
        entityKind: 'plan_execution' as const,
        entityId: source.id,
        semanticKey: executionSemanticKey(payload),
        payload,
        updatedAt: source.updatedAt ?? observedAt,
        updatedAtSource: source.updatedAt ? 'record' as const : 'observed' as const,
      }
    }),
    ...snapshot.practiceRecords.map((source) => ({
      entityKind: 'practice_record' as const,
      entityId: source.id,
      semanticKey: defaultSemanticKey('practice_record', source.id),
      payload: createTrackerPhase4bPayload('practice_record', source),
      updatedAt: source.updatedAt,
      updatedAtSource: 'record' as const,
    })),
    ...snapshot.timerRecords.map((source) => ({
      entityKind: 'timer_record' as const,
      entityId: source.id,
      semanticKey: defaultSemanticKey('timer_record', source.id),
      payload: createTrackerPhase4bPayload('timer_record', source),
      updatedAt: source.updatedAt,
      updatedAtSource: 'record' as const,
    })),
  ].sort(compareEntity)
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    fail(path, 'must be a non-negative safe integer')
  }
  return value
}

function entityKind(value: unknown, path: string): TrackerPhase4bEntityKind {
  if (
    typeof value !== 'string'
    || !(TRACKER_PHASE4B_ENTITY_KINDS as readonly string[]).includes(value)
  ) {
    fail(path, 'is not a Phase 4B entity kind')
  }
  return value as TrackerPhase4bEntityKind
}

function deletedEntitySemanticKey(
  kind: TrackerPhase4bEntityKind,
  entityId: string,
  payload: unknown,
): string {
  if (kind !== 'plan_execution' || typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return defaultSemanticKey(kind, entityId)
  }
  const value = payload as UnknownRecord
  if (value.planId === undefined || value.date === undefined) {
    return defaultSemanticKey(kind, entityId)
  }
  return executionSemanticKey({
    planId: identifier(value.planId, '$.payload.planId'),
    date: localDate(value.date, '$.payload.date'),
    isCompleted: false,
  })
}

export function parseTrackerPhase4bRemoteEntity(value: unknown): TrackerPhase4bRemoteEntity {
  const object = record(value, '$')
  exactKeys(object, [
    'entityKind',
    'entityId',
    'version',
    'cursor',
    'payload',
    'deletedAt',
    'updatedAt',
  ], '$')
  const kind = entityKind(object.entityKind, '$.entityKind')
  const parsedEntityId = identifier(object.entityId, '$.entityId')
  const deletedAt = object.deletedAt === null
    ? null
    : timestamp(object.deletedAt, '$.deletedAt')
  const payload: AnyTrackerPhase4bPayload | null = deletedAt === null
    ? parseTrackerPhase4bPayload(kind, object.payload)
    : null
  const semanticKey = deletedAt === null && kind === 'plan_execution'
    ? executionSemanticKey(payload as TrackerPhase4bExecutionPayload)
    : deletedEntitySemanticKey(kind, parsedEntityId, object.payload)
  return {
    entityKind: kind,
    entityId: parsedEntityId,
    semanticKey,
    version: nonNegativeInteger(object.version, '$.version'),
    cursor: nonNegativeInteger(object.cursor, '$.cursor'),
    payload,
    deletedAt,
    updatedAt: timestamp(object.updatedAt, '$.updatedAt'),
  } as TrackerPhase4bRemoteEntity
}

function sortStableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStableJson)
  if (typeof value !== 'object' || value === null) return value
  const object = value as UnknownRecord
  return Object.fromEntries(
    Object.keys(object).sort().map((key) => [key, sortStableJson(object[key])]),
  )
}

export function stableTrackerPhase4bJson(value: unknown): string {
  return JSON.stringify(sortStableJson(value))
}

function samePayload(left: AnyTrackerPhase4bPayload, right: AnyTrackerPhase4bPayload): boolean {
  return stableTrackerPhase4bJson(left) === stableTrackerPhase4bJson(right)
}

function indexUniqueEntities<T extends { entityKind: TrackerPhase4bEntityKind; entityId: string }>(
  values: readonly T[],
  path: string,
): Map<string, T> {
  const indexed = new Map<string, T>()
  values.forEach((value, index) => {
    const key = phase4bEntityKey(value)
    if (indexed.has(key)) fail(`${path}[${index}]`, 'duplicates an entity semantic key')
    indexed.set(key, value)
  })
  return indexed
}

function executionIsCompleted(entity: TrackerPhase4bRemoteEntity): boolean {
  return entity.entityKind === 'plan_execution'
    && entity.deletedAt === null
    && entity.payload !== null
    && entity.payload.isCompleted
}

function compareRemoteExecutionPreference(
  left: TrackerPhase4bRemoteEntity,
  right: TrackerPhase4bRemoteEntity,
): number {
  if ((left.deletedAt !== null) !== (right.deletedAt !== null)) {
    return left.deletedAt !== null ? -1 : 1
  }
  const leftCompleted = executionIsCompleted(left)
  const rightCompleted = executionIsCompleted(right)
  if (leftCompleted !== rightCompleted) return leftCompleted ? -1 : 1
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.version - left.version
    || left.entityId.localeCompare(right.entityId)
}

export function canonicalizeTrackerPhase4bRemoteEntities(
  values: readonly TrackerPhase4bRemoteEntity[],
  occurredAt: string,
): TrackerPhase4bRemoteCanonicalization {
  const cleanupAt = timestamp(occurredAt, '$.occurredAt')
  const groups = new Map<string, TrackerPhase4bRemoteEntity[]>()
  values.forEach((value) => {
    const key = phase4bEntityKey(value)
    groups.set(key, [...(groups.get(key) ?? []), value])
  })

  const entities: TrackerPhase4bRemoteEntity[] = []
  const cleanupOperations: TrackerPhase4bOperationIntent[] = []
  for (const key of [...groups.keys()].sort()) {
    const group = groups.get(key) ?? []
    if (group.length === 0) continue
    if (group.length > 1 && group.some((entity) => entity.entityKind !== 'plan_execution')) {
      fail('$.remote', 'duplicates a non-execution entity semantic key')
    }
    const ordered = [...group].sort(compareRemoteExecutionPreference)
    const canonical = ordered[0]
    entities.push(canonical)
    ordered.slice(1).forEach((loser) => {
      if (loser.deletedAt !== null) return
      cleanupOperations.push({
        entityKind: loser.entityKind,
        entityId: loser.entityId,
        action: 'delete',
        baseVersion: loser.version,
        occurredAt: cleanupAt,
      })
    })
  }
  return {
    entities,
    cleanupOperations: sortTrackerPhase4bOperationIntents(cleanupOperations),
  }
}

function physicalRemoteKey(value: Pick<TrackerPhase4bRemoteEntity, 'entityKind' | 'entityId'>): string {
  return `${value.entityKind}\u0000${value.entityId}`
}

/**
 * Applies an incremental pull, or replaces the baseline with an authoritative
 * snapshot. Real server tombstones have payload=null; for an execution delete
 * the prior physical row therefore supplies the plan/date semantic key.
 */
export function mergeTrackerPhase4bRemoteEntityChanges(input: {
  baseline: readonly TrackerPhase4bRemoteEntity[]
  changes: readonly TrackerPhase4bRemoteEntity[]
  occurredAt: string
  authoritativeSnapshot?: boolean
}): TrackerPhase4bRemoteMerge {
  const baselineByPhysical = new Map(
    input.baseline.map((entity) => [physicalRemoteKey(entity), entity]),
  )
  const mergedByPhysical = input.authoritativeSnapshot
    ? new Map<string, TrackerPhase4bRemoteEntity>()
    : new Map(baselineByPhysical)

  input.changes.forEach((change) => {
    const key = physicalRemoteKey(change)
    const previous = baselineByPhysical.get(key)
    const normalized = change.entityKind === 'plan_execution'
      && change.deletedAt !== null
      && previous?.entityKind === 'plan_execution'
      ? { ...change, semanticKey: previous.semanticKey } as TrackerPhase4bRemoteEntity
      : change
    mergedByPhysical.set(key, normalized)
  })

  const canonical = canonicalizeTrackerPhase4bRemoteEntities(
    [...mergedByPhysical.values()],
    input.occurredAt,
  )
  const physicallyRemoved = input.authoritativeSnapshot
    ? [...baselineByPhysical.entries()]
      .filter(([key]) => !mergedByPhysical.has(key))
      .map(([, entity]) => entity)
      .sort((left, right) => physicalRemoteKey(left).localeCompare(physicalRemoteKey(right)))
    : []
  return { ...canonical, physicallyRemoved }
}

function operationDependencyRank(operation: TrackerPhase4bOperationIntent): number {
  if (operation.action === 'upsert') {
    if (operation.entityKind === 'study_plan') return 0
    if (operation.entityKind === 'plan_execution') return 2
    return 1
  }
  if (operation.entityKind === 'plan_execution') return 0
  if (operation.entityKind === 'study_plan') return 2
  return 1
}

/**
 * Keeps parent records ahead of execution upserts and behind execution deletes.
 * The deployed RPC validates the parent plan within the same ordered batch.
 */
export function sortTrackerPhase4bOperationIntents(
  operations: readonly TrackerPhase4bOperationIntent[],
): TrackerPhase4bOperationIntent[] {
  return [...operations].sort((left, right) => (
    operationDependencyRank(left) - operationDependencyRank(right)
    || left.action.localeCompare(right.action)
    || left.entityKind.localeCompare(right.entityKind)
    || left.entityId.localeCompare(right.entityId)
    || left.occurredAt.localeCompare(right.occurredAt)
  ))
}

export function diffTrackerPhase4bLocalEntities(
  baseline: readonly TrackerPhase4bRemoteEntity[],
  current: readonly TrackerPhase4bLocalEntity[],
  deletedAt: string,
): TrackerPhase4bLocalDiff {
  const deletionTime = timestamp(deletedAt, '$.deletedAt')
  const canonicalBaseline = canonicalizeTrackerPhase4bRemoteEntities(baseline, deletionTime)
  const baselineByKey = indexUniqueEntities(canonicalBaseline.entities, '$.baseline')
  const currentByKey = indexUniqueEntities(current, '$.current')
  const keys = [...new Set([...baselineByKey.keys(), ...currentByKey.keys()])].sort()
  const operations: TrackerPhase4bOperationIntent[] = [...canonicalBaseline.cleanupOperations]
  const restoreRequired: TrackerPhase4bRestoreRequired[] = []

  for (const key of keys) {
    const previous = baselineByKey.get(key)
    const next = currentByKey.get(key)
    if (!previous && next) {
      operations.push({
        entityKind: next.entityKind,
        entityId: next.entityId,
        action: 'upsert',
        baseVersion: 0,
        occurredAt: next.updatedAt,
        payload: next.payload,
      })
      continue
    }
    if (!previous || !next) {
      if (previous && previous.deletedAt === null) {
        operations.push({
          entityKind: previous.entityKind,
          entityId: previous.entityId,
          action: 'delete',
          baseVersion: previous.version,
          occurredAt: deletionTime,
        })
      }
      continue
    }
    if (previous.deletedAt !== null) {
      restoreRequired.push({
        entityKind: next.entityKind,
        entityId: previous.entityId,
        reason: 'cloud_tombstone_requires_explicit_restore',
      })
      continue
    }
    if (previous.payload !== null && !samePayload(previous.payload, next.payload)) {
      operations.push({
        entityKind: next.entityKind,
        // A legacy execution can have another local random id for the same
        // business key. Update the existing cloud envelope instead of creating
        // a second semantic row.
        entityId: previous.entityId,
        action: 'upsert',
        baseVersion: previous.version,
        occurredAt: next.updatedAt,
        payload: next.payload,
      })
    }
  }

  return {
    operations: sortTrackerPhase4bOperationIntents(operations),
    restoreRequired,
  }
}

type ReconciliationState =
  | { state: 'absent'; updatedAt: null; payload: null }
  | { state: 'live'; updatedAt: string; payload: AnyTrackerPhase4bPayload }
  | { state: 'deleted'; updatedAt: string; payload: null }

function baselineState(entity: TrackerPhase4bRemoteEntity | null): ReconciliationState {
  if (!entity) return { state: 'absent', updatedAt: null, payload: null }
  if (entity.deletedAt !== null || entity.payload === null) {
    return { state: 'deleted', updatedAt: entity.updatedAt, payload: null }
  }
  return { state: 'live', updatedAt: entity.updatedAt, payload: entity.payload }
}

function localState(value: TrackerPhase4bLocalReconciliationState): ReconciliationState {
  if (value.entity) {
    return { state: 'live', updatedAt: value.entity.updatedAt, payload: value.entity.payload }
  }
  if (value.deletedAt) {
    return { state: 'deleted', updatedAt: timestamp(value.deletedAt, '$.local.deletedAt'), payload: null }
  }
  return { state: 'absent', updatedAt: null, payload: null }
}

function sameReconciliationState(left: ReconciliationState, right: ReconciliationState): boolean {
  if (left.state !== right.state) return false
  if (left.state !== 'live' || right.state !== 'live') return true
  return samePayload(left.payload, right.payload)
}

function operationForLocal(
  local: TrackerPhase4bLocalReconciliationState,
  remote: TrackerPhase4bRemoteEntity | null,
  baseline: TrackerPhase4bRemoteEntity | null,
): TrackerPhase4bOperationIntent {
  const reference = local.entity ?? remote ?? baseline
  if (!reference) throw new Error('Cannot create an operation without an entity identity.')
  const baseVersion = remote?.version ?? baseline?.version ?? 0
  if (local.entity) {
    const remoteIdentity = remote && phase4bEntityKey(remote) === phase4bEntityKey(local.entity)
      ? remote
      : null
    return {
      entityKind: local.entity.entityKind,
      // Updating the existing remote envelope also collapses legacy execution
      // ids that differ locally but share one planId/date business key.
      entityId: remoteIdentity?.entityId ?? local.entity.entityId,
      action: 'upsert',
      baseVersion,
      occurredAt: local.entity.updatedAt,
      payload: local.entity.payload,
    }
  }
  if (!local.deletedAt) throw new Error('A local delete requires a deletion timestamp.')
  return {
    entityKind: reference.entityKind,
    entityId: reference.entityId,
    action: 'delete',
    baseVersion,
    occurredAt: local.deletedAt,
  }
}

function installRemoteAction(remote: TrackerPhase4bRemoteEntity): TrackerPhase4bReconciliationPlan {
  return remote.deletedAt === null
    ? { action: 'install_remote_upsert', reason: 'remote_only_change', remote }
    : { action: 'install_remote_delete', reason: 'remote_only_change', remote }
}

function assertSameIdentity(
  baseline: TrackerPhase4bRemoteEntity | null,
  local: TrackerPhase4bLocalReconciliationState,
  remote: TrackerPhase4bRemoteEntity | null,
): void {
  const identities = [baseline, local.entity, remote]
    .filter((value): value is TrackerPhase4bRemoteEntity | TrackerPhase4bLocalEntity => value !== null)
    .map(phase4bEntityKey)
  if (new Set(identities).size > 1) fail('$', 'reconciliation inputs must identify the same entity')
}

function localExecutionCompletion(
  state: TrackerPhase4bLocalReconciliationState,
): boolean | null {
  if (state.entity?.entityKind !== 'plan_execution') return null
  return state.entity.payload.isCompleted
}

function remoteExecutionCompletion(entity: TrackerPhase4bRemoteEntity | null): boolean | null {
  if (
    entity?.entityKind !== 'plan_execution'
    || entity.deletedAt !== null
    || entity.payload === null
  ) {
    return null
  }
  return entity.payload.isCompleted
}

export function planTrackerPhase4bReconciliation(input: {
  baseline: TrackerPhase4bRemoteEntity | null
  local: TrackerPhase4bLocalReconciliationState
  remote: TrackerPhase4bRemoteEntity | null
}): TrackerPhase4bReconciliationPlan {
  assertSameIdentity(input.baseline, input.local, input.remote)
  if (input.baseline && !input.remote) {
    return { action: 'snapshot_required', reason: 'baseline_entity_disappeared' }
  }

  const baseline = baselineState(input.baseline)
  const local = localState(input.local)
  const remote = baselineState(input.remote)
  const localChanged = !sameReconciliationState(local, baseline)
  const remoteChanged = !sameReconciliationState(remote, baseline)

  if (!localChanged && !remoteChanged) return { action: 'none', reason: 'unchanged' }
  if (sameReconciliationState(local, remote)) {
    return input.remote
      ? { action: 'accept_remote', reason: 'same_value', remote: input.remote }
      : { action: 'none', reason: 'same_value' }
  }

  if (input.remote?.deletedAt != null && local.state === 'live' && localChanged) {
    return {
      action: 'restore_choice',
      reason: 'cloud_tombstone_requires_explicit_restore',
      remote: input.remote ?? undefined,
    }
  }

  if (localChanged && !remoteChanged) {
    const operation = operationForLocal(input.local, input.remote, input.baseline)
    return {
      action: operation.action === 'delete' ? 'upload_delete' : 'upload_upsert',
      reason: 'local_only_change',
      operation,
    }
  }
  if (!localChanged && remoteChanged) {
    if (!input.remote) return { action: 'snapshot_required', reason: 'baseline_entity_disappeared' }
    return installRemoteAction(input.remote)
  }


  const localExecutionCompleted = localExecutionCompletion(input.local)
  const remoteExecutionCompleted = remoteExecutionCompletion(input.remote)
  if (
    localExecutionCompleted !== null
    && remoteExecutionCompleted !== null
    && localExecutionCompleted !== remoteExecutionCompleted
  ) {
    if (localExecutionCompleted) {
      const operation = operationForLocal(input.local, input.remote, input.baseline)
      return { action: 'upload_upsert', reason: 'local_lww', operation }
    }
    if (!input.remote) return { action: 'snapshot_required', reason: 'baseline_entity_disappeared' }
    return { action: 'install_remote_upsert', reason: 'remote_lww', remote: input.remote }
  }

  if (
    localExecutionCompleted !== null
    && remoteExecutionCompleted !== null
    && input.local.entity?.updatedAtSource === 'observed'
  ) {
    const operation = operationForLocal(input.local, input.remote, input.baseline)
    return { action: 'upload_upsert', reason: 'local_lww', operation }
  }

  const localTimestamp = local.updatedAt
  const remoteTimestamp = remote.updatedAt
  if (localTimestamp && remoteTimestamp && localTimestamp > remoteTimestamp) {
    const operation = operationForLocal(input.local, input.remote, input.baseline)
    return {
      action: operation.action === 'delete' ? 'upload_delete' : 'upload_upsert',
      reason: 'local_lww',
      operation,
    }
  }
  if (!input.remote) return { action: 'snapshot_required', reason: 'baseline_entity_disappeared' }
  const installed = installRemoteAction(input.remote)
  return { ...installed, reason: 'remote_lww' }
}
