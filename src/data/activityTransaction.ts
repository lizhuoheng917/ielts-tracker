import {
  createActivityEffects,
  type ActivityEventEffects,
} from '@/data/activityLedger'
import {
  createLocalMutation,
  createStateFieldsPatch,
  type LocalMutationAction,
  type LocalMutationJournalV1,
  type LocalMutationPatch,
  type StorageLike,
} from '@/data/localMutationJournal'
import { STORAGE_PREFIX } from '@/lib/constants'
import { levelForXP } from '@/lib/learningXP'
import { toLocalDate } from '@/lib/localDate'
import { applyActivityDelta, deriveStreakData } from '@/lib/streakProjection'
import type { AchievementState, StreakData } from '@/lib/types'
import type { ActivityLedgerAppendInput } from '@/stores/activityLedgerStore'

const ACHIEVEMENT_STORAGE_KEY = `${STORAGE_PREFIX}:achievements`
const STREAK_STORAGE_KEY = `${STORAGE_PREFIX}:streakData`
const SETTINGS_STORAGE_KEY = `${STORAGE_PREFIX}:settings`

export interface ActivityTransactionProjection {
  achievements: Pick<AchievementState, 'totalXP' | 'level'>
  streak: StreakData
  lastCheckinDate?: string
  checkinChanged: boolean
}

export interface ActivityTransactionPlan {
  transaction: LocalMutationJournalV1
  ledgerEvents: ActivityLedgerAppendInput[]
  projectionAfter: ActivityTransactionProjection
}

export type LedgerEventDraft = Omit<ActivityLedgerAppendInput, 'idempotencyKey'> & {
  idempotencyKey?: string
}

function clone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeEffects(event: LedgerEventDraft): ActivityEventEffects {
  return clone(event.effects ?? createActivityEffects(event.entityKind, event.before, event.after))
}

export function projectActivityEvents(input: {
  events: LedgerEventDraft[]
  achievements: Pick<AchievementState, 'totalXP' | 'level'>
  streak: StreakData
  lastCheckinDate?: string
  today?: string
}): ActivityTransactionProjection {
  const today = input.today ?? toLocalDate()
  let totalXP = Number.isFinite(input.achievements.totalXP)
    ? Math.max(0, input.achievements.totalXP)
    : 0
  let heatmapData = clone(input.streak.heatmapData)
  let longestStreak = input.streak.longestStreak
  let activityChanged = false
  let lastCheckinDate = input.lastCheckinDate
  let checkinChanged = false

  for (const event of input.events) {
    const effects = normalizeEffects(event)
    totalXP = Math.max(0, totalXP + effects.xpDelta)
    for (const delta of effects.activityDeltas) {
      heatmapData = applyActivityDelta(heatmapData, delta.date, delta.delta)
      activityChanged = true
    }
    if (effects.activityDeltas.length > 0) {
      longestStreak = Math.max(
        longestStreak,
        deriveStreakData(heatmapData, today).longestStreak,
      )
    }
    if (event.entityKind === 'daily_checkin' && event.after && 'date' in event.after) {
      const date = event.after.date
      if (!lastCheckinDate || date > lastCheckinDate) lastCheckinDate = date
      checkinChanged = true
    }
  }

  const derivedStreak = activityChanged
    ? deriveStreakData(heatmapData, today)
    : clone(input.streak)

  return {
    achievements: { totalXP, level: levelForXP(totalXP) },
    streak: activityChanged
      ? { ...derivedStreak, longestStreak: Math.max(longestStreak, derivedStreak.longestStreak) }
      : derivedStreak,
    lastCheckinDate,
    checkinChanged,
  }
}

export function createActivityTransactionPlan(input: {
  action: LocalMutationAction
  domainPatches: LocalMutationPatch[]
  events: LedgerEventDraft[]
  achievements: Pick<AchievementState, 'totalXP' | 'level'>
  streak: StreakData
  lastCheckinDate?: string
  storage?: StorageLike
  createdAt?: string
  today?: string
}): ActivityTransactionPlan {
  const storage = input.storage ?? localStorage
  const projectionAfter = projectActivityEvents({
    events: input.events,
    achievements: input.achievements,
    streak: input.streak,
    lastCheckinDate: input.lastCheckinDate,
    today: input.today,
  })
  const projectionPatches: LocalMutationPatch[] = [
    createStateFieldsPatch({
      storage,
      storageKey: ACHIEVEMENT_STORAGE_KEY,
      beforeState: input.achievements,
      expectedAfterState: projectionAfter.achievements,
      fields: ['totalXP', 'level'],
    }),
    createStateFieldsPatch({
      storage,
      storageKey: STREAK_STORAGE_KEY,
      beforeState: input.streak as unknown as Record<string, unknown>,
      expectedAfterState: projectionAfter.streak as unknown as Record<string, unknown>,
      fields: ['currentStreak', 'longestStreak', 'lastActiveDate', 'heatmapData'],
    }),
  ]

  if (projectionAfter.checkinChanged) {
    projectionPatches.push(createStateFieldsPatch({
      storage,
      storageKey: SETTINGS_STORAGE_KEY,
      beforeState: input.lastCheckinDate === undefined ? {} : { lastCheckinDate: input.lastCheckinDate },
      expectedAfterState: projectionAfter.lastCheckinDate === undefined
        ? {}
        : { lastCheckinDate: projectionAfter.lastCheckinDate },
      fields: ['lastCheckinDate'],
    }))
  }

  const transaction = createLocalMutation({
    action: input.action,
    patches: [...input.domainPatches, ...projectionPatches],
    createdAt: input.createdAt,
  })
  const ledgerEvents = input.events.map((event, index) => ({
    ...event,
    effects: normalizeEffects(event),
    idempotencyKey: event.idempotencyKey ?? `transaction:${transaction.transactionId}:${index}`,
  }))

  return { transaction, ledgerEvents, projectionAfter }
}
