import { describe, expect, it } from 'vitest'

import type { TimerRecord } from '@/lib/types'
import {
  DEFAULT_DATA_PAGE_SIZE,
  getDataPageCount,
  paginateItems,
} from './dataView'
import {
  filterAndSortTimerRecords,
  resolveTimerRecordDuration,
} from './timerRecordView'

function createRecord(
  overrides: Partial<TimerRecord> & Pick<TimerRecord, 'id'>,
): TimerRecord {
  return {
    subject: 'reading',
    date: '2026-08-01',
    duration: 25 * 60,
    note: 'Cambridge 练习',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

describe('timerRecordView', () => {
  it('保留未编辑的精确秒数，仅在用户修改分钟时换算', () => {
    expect(resolveTimerRecordDuration(1531, '26', false)).toBe(1531)
    expect(resolveTimerRecordDuration(1531, '25', false)).toBe(1531)
    expect(resolveTimerRecordDuration(1531, '25', true)).toBe(1500)
    expect(resolveTimerRecordDuration(1531, '0', true)).toBeUndefined()
  })

  it('filters note or date search, subject, and an inclusive date range', () => {
    const records = [
      createRecord({ id: 'a', date: '2026-07-31', note: '旧记录' }),
      createRecord({ id: 'b', subject: 'listening', note: 'Cambridge Section 4' }),
      createRecord({ id: 'c', date: '2026-08-02', subject: 'reading', note: 'Cambridge passage' }),
    ]

    expect(
      filterAndSortTimerRecords(records, {
        searchQuery: 'CAMBRIDGE',
        subject: 'reading',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-02',
        sortOrder: 'newest',
      }).map((record) => record.id),
    ).toEqual(['c'])

    expect(
      filterAndSortTimerRecords(records, {
        searchQuery: '2026-08-01',
        subject: 'all',
        dateFrom: '',
        dateTo: '',
        sortOrder: 'newest',
      }).map((record) => record.id),
    ).toEqual(['b'])
  })

  it('supports all four stable sort orders without mutating source records', () => {
    const records = [
      createRecord({ id: 'a', date: '2026-08-01', duration: 20 * 60 }),
      createRecord({ id: 'b', date: '2026-08-03', duration: 10 * 60 }),
      createRecord({ id: 'c', date: '2026-08-02', duration: 45 * 60 }),
    ]
    const sourceOrder = records.map((record) => record.id)
    const filters = {
      searchQuery: '',
      subject: 'all' as const,
      dateFrom: '',
      dateTo: '',
    }

    expect(filterAndSortTimerRecords(records, { ...filters, sortOrder: 'newest' }).map((record) => record.id)).toEqual(['b', 'c', 'a'])
    expect(filterAndSortTimerRecords(records, { ...filters, sortOrder: 'oldest' }).map((record) => record.id)).toEqual(['a', 'c', 'b'])
    expect(filterAndSortTimerRecords(records, { ...filters, sortOrder: 'duration-desc' }).map((record) => record.id)).toEqual(['c', 'a', 'b'])
    expect(filterAndSortTimerRecords(records, { ...filters, sortOrder: 'duration-asc' }).map((record) => record.id)).toEqual(['b', 'a', 'c'])
    expect(records.map((record) => record.id)).toEqual(sourceOrder)
  })

  it('keeps a 5000-record dataset bounded to 50 rendered rows per page', () => {
    const records = Array.from({ length: 5_000 }, (_, index) =>
      createRecord({ id: `timer-${index}` }),
    )

    expect(DEFAULT_DATA_PAGE_SIZE).toBe(50)
    expect(getDataPageCount(records.length)).toBe(100)
    expect(paginateItems(records, 1)).toHaveLength(50)
    expect(paginateItems(records, 100)).toHaveLength(50)
    expect(paginateItems(records, 100)[0]?.id).toBe('timer-4950')
  })
})
