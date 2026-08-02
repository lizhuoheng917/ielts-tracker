import { createActivityEffects } from '@/data/activityLedger'
import { XP_RULES } from '@/lib/constants'
import { calculateStreakEndingOn } from '@/lib/streakProjection'
import type { DailyCheckinAward, StreakData } from '@/lib/types'
import type { ActivityLedgerAppendInput } from '@/stores/activityLedgerStore'

export function createDailyCheckinMutation(input: {
  date: string
  occurredAt: string
  streak: StreakData
  recordActivity: boolean
  source: 'manual' | 'plan'
  sourceEntityId?: string
}): { award: DailyCheckinAward; event: Omit<ActivityLedgerAppendInput, 'idempotencyKey'> } {
  const checkin = { date: input.date }
  const activityEffects = createActivityEffects('daily_checkin', null, checkin, {
    dailyCheckinXP: 0,
    recordDailyActivity: input.recordActivity,
  })
  const heatmapAfterActivity = { ...input.streak.heatmapData }
  for (const delta of activityEffects.activityDeltas) {
    const nextCount = (heatmapAfterActivity[delta.date] ?? 0) + delta.delta
    if (nextCount > 0) heatmapAfterActivity[delta.date] = nextCount
    else delete heatmapAfterActivity[delta.date]
  }
  const streakLength = calculateStreakEndingOn(heatmapAfterActivity, input.date)
  const awardedXP = XP_RULES.DAILY_CHECKIN
    + (streakLength >= 7 ? XP_RULES.STREAK_BONUS_AFTER_7 : 0)
  const award: DailyCheckinAward = {
    id: input.date,
    date: input.date,
    awardedXP,
    awardedAt: input.occurredAt,
    source: input.source,
    sourceEntityId: input.sourceEntityId,
  }

  return {
    award,
    event: {
      entityKind: 'daily_checkin',
      entityId: input.date,
      operation: 'checked_in',
      effectiveDate: input.date,
      occurredAt: input.occurredAt,
      source: 'user',
      after: checkin,
      effects: createActivityEffects('daily_checkin', null, checkin, {
        dailyCheckinXP: awardedXP,
        recordDailyActivity: input.recordActivity,
      }),
    },
  }
}
