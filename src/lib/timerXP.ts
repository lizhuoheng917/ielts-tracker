import { XP_RULES } from '@/lib/constants'

const SECONDS_PER_MINUTE = 60

/**
 * Calculate the XP earned by one timer record.
 *
 * Timer records store seconds, while practice records store minutes. Converting
 * seconds to minutes before applying the shared practice rate keeps both record
 * types on the same "15 XP per 30 minutes" rule.
 */
export function calculateTimerRecordXP(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0

  const durationMinutes = durationSeconds / SECONDS_PER_MINUTE
  const units = durationMinutes / 30
  return Math.round(units * XP_RULES.PRACTICE_PER_30MIN)
}

/** Return the XP adjustment required when a timer record changes duration. */
export function calculateTimerRecordXPDelta(
  previousDurationSeconds: number,
  nextDurationSeconds: number,
): number {
  return calculateTimerRecordXP(nextDurationSeconds) - calculateTimerRecordXP(previousDurationSeconds)
}
