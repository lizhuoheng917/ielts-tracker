import { describe, expect, it } from 'vitest'

import type { PracticeRecord } from '@/lib/types'
import {
  IELTS_SCORE_SLIDER_MAX,
  filterAndSortPracticeRecords,
  normalizeIeltsScore,
  scoreToSliderIndex,
  sliderIndexToScore,
} from './practiceRecordView'
import {
  DEFAULT_DATA_PAGE_SIZE,
  getDataPageCount,
  paginateItems,
} from './dataView'

function createRecord(
  overrides: Partial<PracticeRecord> & Pick<PracticeRecord, 'id'>,
): PracticeRecord {
  return {
    type: 'reading',
    date: '2026-08-01',
    topic: 'Cambridge 18 Test 1',
    duration: 60,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

const baseFilters = {
  type: 'reading' as const,
  searchQuery: '',
  dateFrom: '',
  dateTo: '',
}

describe('practiceRecordView', () => {
  it('maps the IELTS slider only to unscored or valid 1–9 band scores', () => {
    expect(scoreToSliderIndex(0)).toBe(0)
    expect(sliderIndexToScore(0)).toBe(0)
    expect(sliderIndexToScore(1)).toBe(1)
    expect(IELTS_SCORE_SLIDER_MAX).toBe(17)
    expect(sliderIndexToScore(IELTS_SCORE_SLIDER_MAX)).toBe(9)
    expect(sliderIndexToScore(18)).toBe(9)
    expect(normalizeIeltsScore(9.5)).toBe(9)
  })

  it('filters by subject, searchable text, and an inclusive date range', () => {
    const records = [
      createRecord({ id: 'a', date: '2026-07-31', note: '旧记录' }),
      createRecord({ id: 'b', note: '需要复盘定位题' }),
      createRecord({ id: 'c', type: 'listening', note: '需要复盘定位题' }),
      createRecord({ id: 'd', date: '2026-08-03', topic: '定位题训练' }),
    ]

    expect(
      filterAndSortPracticeRecords(records, {
        ...baseFilters,
        searchQuery: '定位题',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-02',
        sortOrder: 'newest',
      }).map((record) => record.id),
    ).toEqual(['b'])
  })

  it('supports date, score, and duration sorting without mutating source records', () => {
    const records = [
      createRecord({ id: 'a', date: '2026-08-01', score: 6, duration: 40 }),
      createRecord({ id: 'b', date: '2026-08-03', duration: 20 }),
      createRecord({ id: 'c', date: '2026-08-02', score: 7.5, duration: 60 }),
    ]
    const sourceOrder = records.map((record) => record.id)

    expect(filterAndSortPracticeRecords(records, { ...baseFilters, sortOrder: 'newest' }).map((record) => record.id)).toEqual(['b', 'c', 'a'])
    expect(filterAndSortPracticeRecords(records, { ...baseFilters, sortOrder: 'oldest' }).map((record) => record.id)).toEqual(['a', 'c', 'b'])
    expect(filterAndSortPracticeRecords(records, { ...baseFilters, sortOrder: 'score-desc' }).map((record) => record.id)).toEqual(['c', 'a', 'b'])
    expect(filterAndSortPracticeRecords(records, { ...baseFilters, sortOrder: 'score-asc' }).map((record) => record.id)).toEqual(['a', 'c', 'b'])
    expect(filterAndSortPracticeRecords(records, { ...baseFilters, sortOrder: 'duration-desc' }).map((record) => record.id)).toEqual(['c', 'a', 'b'])
    expect(filterAndSortPracticeRecords(records, { ...baseFilters, sortOrder: 'duration-asc' }).map((record) => record.id)).toEqual(['b', 'a', 'c'])
    expect(records.map((record) => record.id)).toEqual(sourceOrder)
  })

  it('keeps a 5000-record dataset bounded to 50 rendered records per page', () => {
    const records = Array.from({ length: 5_000 }, (_, index) =>
      createRecord({ id: `practice-${index}` }),
    )

    expect(DEFAULT_DATA_PAGE_SIZE).toBe(50)
    expect(getDataPageCount(records.length)).toBe(100)
    expect(paginateItems(records, 1)).toHaveLength(50)
    expect(paginateItems(records, 100)).toHaveLength(50)
    expect(paginateItems(records, 100)[0]?.id).toBe('practice-4950')
  })
})
