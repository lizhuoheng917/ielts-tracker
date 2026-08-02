import { LEVELS, XP_RULES } from '@/lib/constants'

function calculateRecordXP(value: number, unitSize: number, xpPerUnit: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round((value / unitSize) * xpPerUnit)
}

/** Return the total XP earned by one word record. */
export function calculateWordRecordXP(count: number): number {
  return calculateRecordXP(count, 10, XP_RULES.WORDS_PER_10)
}

/** Return the XP adjustment required when a word record changes. */
export function calculateWordRecordXPDelta(previous: number, next: number): number {
  return calculateWordRecordXP(next) - calculateWordRecordXP(previous)
}

/** Return the total XP earned by one practice record. */
export function calculatePracticeRecordXP(minutes: number): number {
  return calculateRecordXP(minutes, 30, XP_RULES.PRACTICE_PER_30MIN)
}

/** Return the XP adjustment required when a practice record changes. */
export function calculatePracticeRecordXPDelta(previous: number, next: number): number {
  return calculatePracticeRecordXP(next) - calculatePracticeRecordXP(previous)
}

/** Derive the persisted level number from total XP. */
export function levelForXP(totalXP: number): number {
  const safeTotalXP = Number.isFinite(totalXP) ? Math.max(0, totalXP) : 0

  for (let index = LEVELS.length - 1; index >= 0; index--) {
    if (safeTotalXP >= LEVELS[index].requiredXP) return LEVELS[index].level
  }

  return LEVELS[0]?.level ?? 1
}
