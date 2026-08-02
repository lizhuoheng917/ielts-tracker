import type { StreakData } from '@/lib/types'
import { addLocalDays, isLocalDate } from '@/lib/localDate'

type HeatmapData = Readonly<Record<string, number>>

function sanitizeHeatmap(heatmap: HeatmapData): Record<string, number> {
  return Object.fromEntries(
    Object.entries(heatmap).filter(
      ([date, count]) => isLocalDate(date) && Number.isInteger(count) && count > 0,
    ),
  )
}

/** Apply one activity contribution while keeping only positive integer counts. */
export function applyActivityDelta(
  heatmap: HeatmapData,
  date: string,
  delta: number,
): Record<string, number> {
  const nextHeatmap = sanitizeHeatmap(heatmap)
  if (!isLocalDate(date) || !Number.isInteger(delta)) return nextHeatmap

  const nextCount = (nextHeatmap[date] ?? 0) + delta
  if (nextCount > 0) nextHeatmap[date] = nextCount
  else delete nextHeatmap[date]

  return nextHeatmap
}

/** Count the consecutive positive-activity days ending on the supplied date. */
export function calculateStreakEndingOn(heatmap: HeatmapData, date: string): number {
  if (!isLocalDate(date)) return 0

  const normalized = sanitizeHeatmap(heatmap)
  let cursor = date
  let streak = 0

  while ((normalized[cursor] ?? 0) > 0) {
    streak += 1
    cursor = addLocalDays(cursor, -1)
  }

  return streak
}

/** Derive all streak fields from the heatmap, using today as the current-streak endpoint. */
export function deriveStreakData(heatmap: HeatmapData, today: string): StreakData {
  const normalized = sanitizeHeatmap(heatmap)
  const activeDates = Object.keys(normalized).sort()
  let longestStreak = 0
  let runningStreak = 0
  let previousDate = ''

  for (const date of activeDates) {
    runningStreak = previousDate !== '' && addLocalDays(previousDate, 1) === date
      ? runningStreak + 1
      : 1
    longestStreak = Math.max(longestStreak, runningStreak)
    previousDate = date
  }

  return {
    currentStreak: calculateStreakEndingOn(normalized, today),
    longestStreak,
    lastActiveDate: activeDates.at(-1) ?? '',
    heatmapData: normalized,
  }
}
