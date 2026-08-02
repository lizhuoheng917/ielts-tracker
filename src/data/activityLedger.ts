import type {
  AchievementState,
  DiaryEntry,
  PlanExecution,
  PracticeRecord,
  StreakData,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import {
  calculatePracticeRecordXP,
  calculateWordRecordXP,
  levelForXP,
} from '@/lib/learningXP'
import { XP_RULES } from '@/lib/constants'
import { applyActivityDelta, deriveStreakData } from '@/lib/streakProjection'
import { calculateTimerRecordXP } from '@/lib/timerXP'

export const ACTIVITY_LEDGER_SCHEMA_VERSION = 1 as const

export type ActivityEntityKind =
  | 'word_record'
  | 'practice_record'
  | 'timer_record'
  | 'diary_entry'
  | 'plan_execution'
  | 'daily_checkin'

export type ActivityOperation =
  | 'snapshot'
  | 'created'
  | 'updated'
  | 'deleted'
  | 'checked_in'

export type ActivityEventSource =
  | 'user'
  | 'timer'
  | 'migration'
  | 'import'
  | 'rebase'
  | 'recovery'

export interface DailyCheckinSnapshot {
  date: string
}

export type ActivityEntitySnapshot =
  | WordRecord
  | PracticeRecord
  | TimerRecord
  | DiaryEntry
  | PlanExecution
  | DailyCheckinSnapshot

export interface ActivityDateDelta {
  date: string
  delta: number
}

export interface ActivityEventEffects {
  xpDelta: number
  activityDeltas: ActivityDateDelta[]
}

export interface ActivityEffectOptions {
  dailyCheckinXP?: number
  recordDailyActivity?: boolean
}

export interface ActivityEvent {
  schemaVersion: typeof ACTIVITY_LEDGER_SCHEMA_VERSION
  eventId: string
  idempotencyKey: string
  entityKind: ActivityEntityKind
  entityId: string
  revision: number
  operation: ActivityOperation
  effectiveDate?: string
  occurredAt: string
  source: ActivityEventSource
  before?: ActivityEntitySnapshot | null
  after?: ActivityEntitySnapshot | null
  effects: ActivityEventEffects
}

export interface ActivityEventInput extends Omit<ActivityEvent, 'schemaVersion' | 'effects'> {
  effects?: ActivityEventEffects
}

export interface ActivityLedgerBaseline {
  capturedAt: string
  source: ActivityEventSource
  achievements: AchievementState
  streak: StreakData
  lastCheckinDate?: string
  rewardedCheckinDates: string[]
}

export interface ActivityLedgerSnapshot {
  schemaVersion: typeof ACTIVITY_LEDGER_SCHEMA_VERSION
  baseline: ActivityLedgerBaseline
  events: ActivityEvent[]
}

export interface ActivityLedgerSourceSnapshot {
  achievements: AchievementState
  streak: StreakData
  lastCheckinDate?: string
  rewardedCheckinDates: string[]
}

export interface ReplayedActivityProjection {
  achievements: AchievementState
  streak: StreakData
  lastCheckinDate?: string
  rewardedCheckinDates: string[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function recordDate(value: ActivityEntitySnapshot | null | undefined): string | undefined {
  if (!value || typeof value.date !== 'string') return undefined
  return value.date
}

function activeDate(
  entityKind: ActivityEntityKind,
  value: ActivityEntitySnapshot | null | undefined,
): string | undefined {
  if (!value) return undefined
  if (entityKind === 'plan_execution' && !(value as PlanExecution).isCompleted) return undefined
  return recordDate(value)
}

function xpForEntity(
  entityKind: ActivityEntityKind,
  value: ActivityEntitySnapshot | null | undefined,
): number {
  if (!value) return 0

  switch (entityKind) {
    case 'word_record':
      return calculateWordRecordXP((value as WordRecord).count)
    case 'practice_record':
      return calculatePracticeRecordXP((value as PracticeRecord).duration)
    case 'timer_record':
      return calculateTimerRecordXP((value as TimerRecord).duration)
    case 'diary_entry':
      return XP_RULES.DIARY
    default:
      return 0
  }
}

function activityDeltasForDates(
  beforeDate: string | undefined,
  afterDate: string | undefined,
): ActivityDateDelta[] {
  if (beforeDate === afterDate) return []

  const deltas: ActivityDateDelta[] = []
  if (beforeDate) deltas.push({ date: beforeDate, delta: -1 })
  if (afterDate) deltas.push({ date: afterDate, delta: 1 })
  return deltas
}

export function createActivityEffects(
  entityKind: ActivityEntityKind,
  before: ActivityEntitySnapshot | null | undefined,
  after: ActivityEntitySnapshot | null | undefined,
  options: ActivityEffectOptions = {},
): ActivityEventEffects {
  if (entityKind === 'daily_checkin') {
    const beforeDate = options.recordDailyActivity === false ? undefined : activeDate(entityKind, before)
    const afterDate = options.recordDailyActivity === false ? undefined : activeDate(entityKind, after)
    const direction = after && !before ? 1 : before && !after ? -1 : 0
    const dailyCheckinXP = Number.isFinite(options.dailyCheckinXP)
      ? Math.max(0, options.dailyCheckinXP ?? 0)
      : 0

    return {
      xpDelta: dailyCheckinXP * direction,
      activityDeltas: activityDeltasForDates(beforeDate, afterDate),
    }
  }

  return {
    xpDelta: xpForEntity(entityKind, after) - xpForEntity(entityKind, before),
    activityDeltas: activityDeltasForDates(
      activeDate(entityKind, before),
      activeDate(entityKind, after),
    ),
  }
}

export function createActivityEvent(input: ActivityEventInput): ActivityEvent {
  return {
    schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
    ...input,
    before: input.before === undefined ? undefined : clone(input.before),
    after: input.after === undefined ? undefined : clone(input.after),
    effects: clone(input.effects ?? createActivityEffects(input.entityKind, input.before, input.after)),
  }
}

export function createBackfillLedger(
  source: ActivityLedgerSourceSnapshot,
  capturedAt: string,
  baselineSource: ActivityEventSource = 'migration',
): ActivityLedgerSnapshot {
  const rewardedCheckinDates = new Set(source.rewardedCheckinDates)
  if (source.lastCheckinDate) rewardedCheckinDates.add(source.lastCheckinDate)

  return {
    schemaVersion: ACTIVITY_LEDGER_SCHEMA_VERSION,
    baseline: clone({
      capturedAt,
      source: baselineSource,
      achievements: source.achievements,
      streak: source.streak,
      lastCheckinDate: source.lastCheckinDate,
      rewardedCheckinDates: [...rewardedCheckinDates].sort(),
    }),
    // Existing records are already represented by the canonical XP and heatmap
    // checkpoint. Bootstrap intentionally does not enumerate or copy their
    // notes/content; v1 journals only post-baseline mutations.
    events: [],
  }
}

export function replayActivityLedger(
  snapshot: ActivityLedgerSnapshot,
  today: string,
): ReplayedActivityProjection {
  const seenIdempotencyKeys = new Set<string>()
  let totalXP = Number.isFinite(snapshot.baseline.achievements.totalXP)
    ? Math.max(0, snapshot.baseline.achievements.totalXP)
    : 0
  let xpChanged = false
  let heatmapData = clone(snapshot.baseline.streak.heatmapData)
  let longestStreak = snapshot.baseline.streak.longestStreak
  let lastCheckinDate = snapshot.baseline.lastCheckinDate
  const rewardedCheckinDates = new Set(snapshot.baseline.rewardedCheckinDates)

  for (const event of snapshot.events) {
    if (seenIdempotencyKeys.has(event.idempotencyKey)) continue
    seenIdempotencyKeys.add(event.idempotencyKey)
    if (event.operation === 'snapshot') continue

    if (event.effects.xpDelta !== 0) {
      totalXP = Math.max(0, totalXP + event.effects.xpDelta)
      xpChanged = true
    }
    for (const activityDelta of event.effects.activityDeltas) {
      heatmapData = applyActivityDelta(heatmapData, activityDelta.date, activityDelta.delta)
    }
    if (event.effects.activityDeltas.length > 0) {
      // longestStreak is historical, so a later edit or deletion must not erase
      // a peak that was reached earlier in the event stream.
      longestStreak = Math.max(
        longestStreak,
        deriveStreakData(heatmapData, today).longestStreak,
      )
    }

    if (event.entityKind === 'daily_checkin' && event.after) {
      const date = recordDate(event.after)
      if (date) {
        rewardedCheckinDates.add(date)
        if (!lastCheckinDate || date > lastCheckinDate) lastCheckinDate = date
      }
    }
  }

  // currentStreak is time-relative. A persisted baseline can be replayed on a
  // later day even when no activity-changing event was appended, so always
  // derive the current value from the canonical heatmap and today's date.
  const derivedStreak = deriveStreakData(heatmapData, today)
  const streak = {
    ...derivedStreak,
    longestStreak: Math.max(longestStreak, derivedStreak.longestStreak),
  }

  return {
    achievements: {
      unlockedBadges: [...snapshot.baseline.achievements.unlockedBadges],
      totalXP,
      // A fresh shadow ledger must reproduce legacy state byte-for-byte. Only
      // normalize the level after this ledger has actually changed XP.
      level: xpChanged ? levelForXP(totalXP) : snapshot.baseline.achievements.level,
      statsViewCount: snapshot.baseline.achievements.statsViewCount,
    },
    streak,
    lastCheckinDate,
    rewardedCheckinDates: [...rewardedCheckinDates].sort(),
  }
}
