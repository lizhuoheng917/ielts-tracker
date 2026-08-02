import type {
  PlanExecution,
  PracticeRecord,
  PracticeType,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import {
  addLocalDays,
  isLocalDate,
  toLocalDate,
  type LocalDate,
} from '@/lib/localDate'
import { canonicalizePlanExecutions } from '@/lib/planExecution'

export const STATS_RANGE_DAYS = [7, 30, 90] as const

export type StatsRangeDays = (typeof STATS_RANGE_DAYS)[number]
export type StatsRangeEnd = Date | LocalDate

export interface LocalDateRange {
  startDate: LocalDate
  endDate: LocalDate
}

export interface StatsAnalyticsInput {
  wordRecords: readonly WordRecord[]
  practiceRecords: readonly PracticeRecord[]
  timerRecords: readonly TimerRecord[]
  planExecutions: readonly PlanExecution[]
}

export interface DailyWordTrendPoint {
  date: LocalDate
  count: number
}

export interface DailyStudyDurationPoint {
  date: LocalDate
  totalSeconds: number
  displayMinutes: number
}

export interface SubjectScorePoint {
  type: PracticeType
  score: number
  scoredRecordCount: number
}

export interface WordCategoryPoint {
  name: string
  value: number
}

export interface DateRangeSummary extends LocalDateRange {
  totalWords: number
  totalStudySeconds: number
  displayMinutes: number
  practiceCount: number
  timerSessionCount: number
  studySessionCount: number
  completedPlanCount: number
}

export interface StatsRangeAnalytics {
  rangeDays: StatsRangeDays
  range: LocalDateRange
  wordTrend: DailyWordTrendPoint[]
  studyDuration: DailyStudyDurationPoint[]
  subjectScores: SubjectScorePoint[]
  wordCategories: WordCategoryPoint[]
  overview: DateRangeSummary
}

export type ActivityLevel = 0 | 1 | 2 | 3 | 4

const PRACTICE_TYPES: readonly PracticeType[] = [
  'reading',
  'listening',
  'writing',
  'speaking',
]

function resolveLocalDate(value: StatsRangeEnd): LocalDate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid range end date')
    }

    return toLocalDate(value)
  }

  if (!isLocalDate(value)) {
    throw new Error(`Invalid local date: ${String(value)}`)
  }

  return value
}

function assertValidRange(range: LocalDateRange): void {
  if (!isLocalDate(range.startDate)) {
    throw new Error(`Invalid local date: ${String(range.startDate)}`)
  }
  if (!isLocalDate(range.endDate)) {
    throw new Error(`Invalid local date: ${String(range.endDate)}`)
  }
  if (range.startDate > range.endDate) {
    throw new Error('Range start date must not be after its end date')
  }
}

function isDateInRange(date: string, range: LocalDateRange): boolean {
  return date >= range.startDate && date <= range.endDate
}

function practiceDurationToSeconds(durationMinutes: number): number {
  return durationMinutes * 60
}

/** Shared visual intensity contract for every learning-activity heatmap. */
export function getActivityLevel(value: number): ActivityLevel {
  if (value <= 0) return 0
  if (value <= 2) return 1
  if (value <= 5) return 2
  if (value <= 8) return 3
  return 4
}

/** Counts valid, non-future dates with at least one accumulated activity event. */
export function countActiveDays(
  heatmapData: Readonly<Record<string, number>>,
  end: StatsRangeEnd = new Date(),
): number {
  const endDate = resolveLocalDate(end)

  return Object.entries(heatmapData).filter(
    ([date, value]) => isLocalDate(date) && date <= endDate && value > 0,
  ).length
}

/**
 * Converts exact accumulated study seconds into the whole minutes shown in the
 * product. Call this only after summing all relevant records so sub-minute timer
 * sessions can combine without losing precision.
 */
export function toDisplayMinutes(totalSeconds: number): number {
  return Math.floor(totalSeconds / 60)
}

/** Returns an inclusive rolling date range ending on the supplied local day. */
export function getRollingDateRange(
  rangeDays: StatsRangeDays,
  end: StatsRangeEnd = new Date(),
): LocalDateRange {
  const endDate = resolveLocalDate(end)

  return {
    startDate: addLocalDays(endDate, -(rangeDays - 1)),
    endDate,
  }
}

/** Generates every local calendar date in an inclusive range. */
export function createLocalDateSeries(range: LocalDateRange): LocalDate[] {
  assertValidRange(range)

  const dates: LocalDate[] = []
  let date = range.startDate

  while (date <= range.endDate) {
    dates.push(date)
    date = addLocalDays(date, 1)
  }

  return dates
}

export function aggregateWordTrend(
  records: readonly WordRecord[],
  range: LocalDateRange,
): DailyWordTrendPoint[] {
  const totals = new Map<LocalDate, number>()

  for (const record of records) {
    if (!isDateInRange(record.date, range)) continue
    totals.set(record.date, (totals.get(record.date) ?? 0) + record.count)
  }

  return createLocalDateSeries(range).map((date) => ({
    date,
    count: totals.get(date) ?? 0,
  }))
}

/**
 * Returns exact daily study seconds from both formal practice and timer
 * sessions. Display minutes are floored once per completed daily aggregate.
 */
export function aggregateDailyStudyDuration(
  practiceRecords: readonly PracticeRecord[],
  timerRecords: readonly TimerRecord[],
  range: LocalDateRange,
): DailyStudyDurationPoint[] {
  const totals = new Map<LocalDate, number>()

  for (const record of practiceRecords) {
    if (!isDateInRange(record.date, range)) continue
    totals.set(
      record.date,
      (totals.get(record.date) ?? 0) + practiceDurationToSeconds(record.duration),
    )
  }

  for (const record of timerRecords) {
    if (!isDateInRange(record.date, range)) continue
    totals.set(record.date, (totals.get(record.date) ?? 0) + record.duration)
  }

  return createLocalDateSeries(range).map((date) => {
    const totalSeconds = totals.get(date) ?? 0

    return {
      date,
      totalSeconds,
      displayMinutes: toDisplayMinutes(totalSeconds),
    }
  })
}

export function aggregateSubjectScores(
  records: readonly PracticeRecord[],
  range: LocalDateRange,
): SubjectScorePoint[] {
  return PRACTICE_TYPES.map((type) => {
    let scoreTotal = 0
    let scoredRecordCount = 0

    for (const record of records) {
      if (
        record.type !== type ||
        !isDateInRange(record.date, range) ||
        record.score === undefined ||
        record.score <= 0
      ) {
        continue
      }

      scoreTotal += record.score
      scoredRecordCount += 1
    }

    return {
      type,
      score:
        scoredRecordCount === 0
          ? 0
          : Math.round((scoreTotal / scoredRecordCount) * 10) / 10,
      scoredRecordCount,
    }
  })
}

export function aggregateWordCategories(
  records: readonly WordRecord[],
  range: LocalDateRange,
): WordCategoryPoint[] {
  const totals = new Map<string, number>()

  for (const record of records) {
    if (!isDateInRange(record.date, range)) continue
    const category = record.category.trim() || '未分类'
    totals.set(category, (totals.get(category) ?? 0) + record.count)
  }

  return Array.from(totals, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value || a.name.localeCompare(b.name, 'zh-CN'),
  )
}

/**
 * Shared exact duration primitive for Stats and Dashboard. The range is
 * inclusive, so today/week/month and rolling 7/30/90-day views use one rule.
 */
export function getTotalStudySeconds(
  practiceRecords: readonly PracticeRecord[],
  timerRecords: readonly TimerRecord[],
  range: LocalDateRange,
): number {
  assertValidRange(range)

  let totalSeconds = 0

  for (const record of practiceRecords) {
    if (isDateInRange(record.date, range)) {
      totalSeconds += practiceDurationToSeconds(record.duration)
    }
  }

  for (const record of timerRecords) {
    if (isDateInRange(record.date, range)) {
      totalSeconds += record.duration
    }
  }

  return totalSeconds
}

/** Shared inclusive summary for rolling periods and arbitrary calendar ranges. */
export function getDateRangeSummary(
  input: StatsAnalyticsInput,
  range: LocalDateRange,
): DateRangeSummary {
  assertValidRange(range)

  let totalWords = 0
  let practiceCount = 0
  let timerSessionCount = 0
  let completedPlanCount = 0

  for (const record of input.wordRecords) {
    if (isDateInRange(record.date, range)) totalWords += record.count
  }

  for (const record of input.practiceRecords) {
    if (isDateInRange(record.date, range)) practiceCount += 1
  }

  for (const record of input.timerRecords) {
    if (isDateInRange(record.date, range)) timerSessionCount += 1
  }

  for (const execution of canonicalizePlanExecutions(input.planExecutions).executions) {
    if (execution.isCompleted && isDateInRange(execution.date, range)) {
      completedPlanCount += 1
    }
  }

  const totalStudySeconds = getTotalStudySeconds(
    input.practiceRecords,
    input.timerRecords,
    range,
  )

  return {
    ...range,
    totalWords,
    totalStudySeconds,
    displayMinutes: toDisplayMinutes(totalStudySeconds),
    practiceCount,
    timerSessionCount,
    studySessionCount: practiceCount + timerSessionCount,
    completedPlanCount,
  }
}

export function getStatsRangeAnalytics(
  input: StatsAnalyticsInput,
  rangeDays: StatsRangeDays,
  end: StatsRangeEnd = new Date(),
): StatsRangeAnalytics {
  const range = getRollingDateRange(rangeDays, end)

  return {
    rangeDays,
    range,
    wordTrend: aggregateWordTrend(input.wordRecords, range),
    studyDuration: aggregateDailyStudyDuration(
      input.practiceRecords,
      input.timerRecords,
      range,
    ),
    subjectScores: aggregateSubjectScores(input.practiceRecords, range),
    wordCategories: aggregateWordCategories(input.wordRecords, range),
    overview: getDateRangeSummary(input, range),
  }
}
