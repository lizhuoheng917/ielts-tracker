import { describe, expect, it } from 'vitest'

import type { WordRecord } from '@/lib/types'
import {
  filterAndSortWordRecords,
  getWordRecordPageCount,
  paginateWordRecords,
  WORD_RECORD_PAGE_SIZE,
} from './wordRecordView'

function createRecord(overrides: Partial<WordRecord> & Pick<WordRecord, 'id'>): WordRecord {
  return {
    date: '2026-08-01',
    category: '学术词汇',
    count: 20,
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('wordRecordView', () => {
  it('filters searchable fields, category, and an inclusive date range', () => {
    const records = [
      createRecord({ id: 'a', date: '2026-07-31', note: '旧记录' }),
      createRecord({ id: 'b', note: 'Cambridge 同义替换' }),
      createRecord({ id: 'c', date: '2026-08-02', category: '场景词汇', note: 'Cambridge' }),
    ]

    expect(
      filterAndSortWordRecords(records, {
        searchQuery: 'CAMBRIDGE',
        category: '学术词汇',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-02',
        sortOrder: 'newest',
      }).map((record) => record.id),
    ).toEqual(['b'])
  })

  it('supports all four stable sort orders without mutating source records', () => {
    const records = [
      createRecord({ id: 'a', date: '2026-08-01', count: 10 }),
      createRecord({ id: 'b', date: '2026-08-03', count: 5 }),
      createRecord({ id: 'c', date: '2026-08-02', count: 30 }),
    ]
    const sourceOrder = records.map((record) => record.id)
    const filter = {
      searchQuery: '',
      category: 'all',
      dateFrom: '',
      dateTo: '',
    }

    expect(filterAndSortWordRecords(records, { ...filter, sortOrder: 'newest' }).map((record) => record.id)).toEqual(['b', 'c', 'a'])
    expect(filterAndSortWordRecords(records, { ...filter, sortOrder: 'oldest' }).map((record) => record.id)).toEqual(['a', 'c', 'b'])
    expect(filterAndSortWordRecords(records, { ...filter, sortOrder: 'count-desc' }).map((record) => record.id)).toEqual(['c', 'a', 'b'])
    expect(filterAndSortWordRecords(records, { ...filter, sortOrder: 'count-asc' }).map((record) => record.id)).toEqual(['b', 'a', 'c'])
    expect(records.map((record) => record.id)).toEqual(sourceOrder)
  })

  it('keeps a 5000-record dataset bounded to 50 rendered rows per page', () => {
    const records = Array.from({ length: 5_000 }, (_, index) =>
      createRecord({
        id: `word-${index}`,
        count: index + 1,
      }),
    )

    expect(WORD_RECORD_PAGE_SIZE).toBe(50)
    expect(getWordRecordPageCount(records.length)).toBe(100)
    expect(paginateWordRecords(records, 1)).toHaveLength(50)
    expect(paginateWordRecords(records, 100)).toHaveLength(50)
    expect(paginateWordRecords(records, 100)[0]?.id).toBe('word-4950')
  })
})
