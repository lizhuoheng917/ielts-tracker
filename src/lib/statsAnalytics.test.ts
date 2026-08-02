import { describe, expect, it } from 'vitest'

import type {
  PlanExecution,
  PracticeRecord,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import {
  STATS_RANGE_DAYS,
  aggregateDailyStudyDuration,
  aggregateSubjectScores,
  aggregateWordCategories,
  aggregateWordTrend,
  countActiveDays,
  createLocalDateSeries,
  getDateRangeSummary,
  getActivityLevel,
  getRollingDateRange,
  getStatsRangeAnalytics,
  getTotalStudySeconds,
  toDisplayMinutes,
  type LocalDateRange,
  type StatsAnalyticsInput,
} from './statsAnalytics'

function createWord(
  id: string,
  date: string,
  count: number,
  category = '核心词汇',
): WordRecord {
  return {
    id,
    date,
    category,
    count,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}

function createPractice(
  id: string,
  date: string,
  duration: number,
  type: PracticeRecord['type'] = 'reading',
  score?: number,
): PracticeRecord {
  return {
    id,
    type,
    date,
    duration,
    score,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}

function createTimer(
  id: string,
  date: string,
  duration: number,
): TimerRecord {
  return {
    id,
    subject: 'general',
    date,
    duration,
    createdAt: `${date}T08:00:00.000Z`,
    updatedAt: `${date}T08:00:00.000Z`,
  }
}

function createExecution(
  id: string,
  date: string,
  isCompleted: boolean,
): PlanExecution {
  return {
    id,
    planId: 'plan-1',
    date,
    isCompleted,
  }
}

const range: LocalDateRange = {
  startDate: '2026-07-30',
  endDate: '2026-08-01',
}

describe('statsAnalytics date ranges', () => {
  it('defines the supported 7, 30, and 90-day periods', () => {
    expect(STATS_RANGE_DAYS).toEqual([7, 30, 90])
  })

  it('creates an inclusive rolling local-date range and continuous cross-month series', () => {
    const rollingRange = getRollingDateRange(7, new Date(2026, 7, 1, 23, 30))

    expect(rollingRange).toEqual({
      startDate: '2026-07-26',
      endDate: '2026-08-01',
    })
    expect(createLocalDateSeries(rollingRange)).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ])
  })

  it('rejects inverted local-date ranges', () => {
    expect(() =>
      createLocalDateSeries({ startDate: '2026-08-02', endDate: '2026-08-01' }),
    ).toThrow('Range start date must not be after its end date')
  })
})

describe('statsAnalytics activity levels', () => {
  it('uses one shared heatmap intensity scale', () => {
    expect([-1, 0, 1, 2, 3, 5, 6, 8, 9].map(getActivityLevel)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4,
    ])
  })

  it('counts only positive valid activity dates through the selected day', () => {
    expect(countActiveDays({
      '2026-07-31': 2,
      '2026-08-01': 1,
      '2026-08-02': 9,
      '2026-07-30': 0,
      invalid: 8,
    }, '2026-08-01')).toBe(2)
  })
})

describe('statsAnalytics aggregations', () => {
  it('fills missing days and includes both range boundaries in the word trend', () => {
    const records = [
      createWord('before', '2026-07-29', 99),
      createWord('start', '2026-07-30', 10),
      createWord('end-a', '2026-08-01', 4),
      createWord('end-b', '2026-08-01', 6),
      createWord('future', '2026-08-02', 99),
    ]

    expect(aggregateWordTrend(records, range)).toEqual([
      { date: '2026-07-30', count: 10 },
      { date: '2026-07-31', count: 0 },
      { date: '2026-08-01', count: 10 },
    ])
  })

  it('sums exact timer seconds before converting daily and total display minutes', () => {
    const practice = [createPractice('practice', '2026-07-31', 1)]
    const timer = [
      createTimer('timer-a', '2026-07-31', 31),
      createTimer('timer-b', '2026-07-31', 31),
      createTimer('future', '2026-08-02', 3_600),
    ]

    expect(aggregateDailyStudyDuration(practice, timer, range)).toEqual([
      { date: '2026-07-30', totalSeconds: 0, displayMinutes: 0 },
      { date: '2026-07-31', totalSeconds: 122, displayMinutes: 2 },
      { date: '2026-08-01', totalSeconds: 0, displayMinutes: 0 },
    ])
    expect(getTotalStudySeconds(practice, timer, range)).toBe(122)
    expect(toDisplayMinutes(122)).toBe(2)
  })

  it('calculates one-decimal four-subject scores only inside the selected range', () => {
    const records = [
      createPractice('reading-a', '2026-07-30', 30, 'reading', 6.5),
      createPractice('reading-b', '2026-08-01', 30, 'reading', 7),
      createPractice('reading-future', '2026-08-02', 30, 'reading', 9),
      createPractice('listening-unscored', '2026-07-31', 30, 'listening'),
      createPractice('writing', '2026-07-31', 30, 'writing', 8),
    ]

    expect(aggregateSubjectScores(records, range)).toEqual([
      { type: 'reading', score: 6.8, scoredRecordCount: 2 },
      { type: 'listening', score: 0, scoredRecordCount: 0 },
      { type: 'writing', score: 8, scoredRecordCount: 1 },
      { type: 'speaking', score: 0, scoredRecordCount: 0 },
    ])
  })

  it('groups word categories within the range and normalizes blank categories', () => {
    const records = [
      createWord('a', '2026-07-30', 4, '核心词汇'),
      createWord('b', '2026-08-01', 6, '核心词汇'),
      createWord('c', '2026-07-31', 3, '  '),
      createWord('future', '2026-08-02', 100, '未来'),
    ]

    expect(aggregateWordCategories(records, range)).toEqual([
      { name: '核心词汇', value: 10 },
      { name: '未分类', value: 3 },
    ])
  })

  it('returns zero-filled chart series and overview values for empty data', () => {
    const emptyInput: StatsAnalyticsInput = {
      wordRecords: [],
      practiceRecords: [],
      timerRecords: [],
      planExecutions: [],
    }
    const analytics = getStatsRangeAnalytics(emptyInput, 7, '2026-08-01')

    expect(analytics.wordTrend).toHaveLength(7)
    expect(analytics.wordTrend.every((point) => point.count === 0)).toBe(true)
    expect(analytics.studyDuration.every((point) => point.totalSeconds === 0)).toBe(true)
    expect(analytics.subjectScores).toHaveLength(4)
    expect(analytics.wordCategories).toEqual([])
    expect(analytics.overview).toEqual({
      startDate: '2026-07-26',
      endDate: '2026-08-01',
      totalWords: 0,
      totalStudySeconds: 0,
      displayMinutes: 0,
      practiceCount: 0,
      timerSessionCount: 0,
      studySessionCount: 0,
      completedPlanCount: 0,
    })
  })

  it('builds a shared arbitrary-range summary and excludes future data', () => {
    const input: StatsAnalyticsInput = {
      wordRecords: [
        createWord('start', '2026-07-30', 5),
        createWord('end', '2026-08-01', 7),
        createWord('future', '2026-08-02', 100),
      ],
      practiceRecords: [
        createPractice('practice', '2026-07-31', 20),
        createPractice('future', '2026-08-02', 60),
      ],
      timerRecords: [
        createTimer('timer-a', '2026-07-31', 31),
        createTimer('timer-b', '2026-07-31', 31),
        createTimer('future', '2026-08-02', 3_600),
      ],
      planExecutions: [
        createExecution('done-start', '2026-07-30', true),
        createExecution('not-done', '2026-07-31', false),
        createExecution('done-end', '2026-08-01', true),
        createExecution('future', '2026-08-02', true),
      ],
    }

    expect(getDateRangeSummary(input, range)).toEqual({
      startDate: '2026-07-30',
      endDate: '2026-08-01',
      totalWords: 12,
      totalStudySeconds: 1_262,
      displayMinutes: 21,
      practiceCount: 1,
      timerSessionCount: 2,
      studySessionCount: 3,
      completedPlanCount: 2,
    })
  })

  it('counts a semantic plan execution once when legacy duplicate ids remain', () => {
    const input: StatsAnalyticsInput = {
      wordRecords: [],
      practiceRecords: [],
      timerRecords: [],
      planExecutions: [
        createExecution('canonical', '2026-08-01', true),
        createExecution('legacy-duplicate', '2026-08-01', false),
      ],
    }

    expect(getDateRangeSummary(input, range).completedPlanCount).toBe(1)
    expect(input.planExecutions).toHaveLength(2)
  })

  it('does not reorder or modify any source arrays or records', () => {
    const input: StatsAnalyticsInput = {
      wordRecords: [
        createWord('second', '2026-08-01', 2, 'B'),
        createWord('first', '2026-07-30', 1, 'A'),
      ],
      practiceRecords: [
        createPractice('practice-second', '2026-08-01', 20, 'speaking', 7),
        createPractice('practice-first', '2026-07-30', 30, 'reading', 6),
      ],
      timerRecords: [
        createTimer('timer-second', '2026-08-01', 90),
        createTimer('timer-first', '2026-07-30', 30),
      ],
      planExecutions: [
        createExecution('execution-second', '2026-08-01', true),
        createExecution('execution-first', '2026-07-30', false),
      ],
    }
    const snapshot = JSON.stringify(input)

    getStatsRangeAnalytics(input, 7, '2026-08-01')
    getDateRangeSummary(input, range)

    expect(JSON.stringify(input)).toBe(snapshot)
  })
})
