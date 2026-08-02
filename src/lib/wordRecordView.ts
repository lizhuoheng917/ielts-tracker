import type { WordRecord } from '@/lib/types'
import {
  DEFAULT_DATA_PAGE_SIZE,
  getDataPageCount,
  paginateItems,
} from '@/lib/dataView'

export type WordRecordSortOrder =
  | 'newest'
  | 'oldest'
  | 'count-desc'
  | 'count-asc'

export interface WordRecordFilters {
  searchQuery: string
  category: string
  dateFrom: string
  dateTo: string
  sortOrder: WordRecordSortOrder
}

export const WORD_RECORD_PAGE_SIZE = DEFAULT_DATA_PAGE_SIZE

export function filterAndSortWordRecords(
  records: readonly WordRecord[],
  filters: WordRecordFilters,
): WordRecord[] {
  const normalizedQuery = filters.searchQuery.trim().toLocaleLowerCase('zh-CN')

  return records
    .filter((record) => {
      const matchesCategory =
        filters.category === 'all' || record.category === filters.category
      const matchesStartDate = !filters.dateFrom || record.date >= filters.dateFrom
      const matchesEndDate = !filters.dateTo || record.date <= filters.dateTo
      const searchableText = [
        record.date,
        record.category,
        record.subCategory,
        record.note,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')
      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery)

      return (
        matchesCategory &&
        matchesStartDate &&
        matchesEndDate &&
        matchesQuery
      )
    })
    .sort((a, b) => {
      if (filters.sortOrder === 'oldest') {
        return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      }
      if (filters.sortOrder === 'count-desc') {
        return b.count - a.count || b.date.localeCompare(a.date)
      }
      if (filters.sortOrder === 'count-asc') {
        return a.count - b.count || b.date.localeCompare(a.date)
      }
      return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    })
}

export function getWordRecordPageCount(
  recordCount: number,
  pageSize = WORD_RECORD_PAGE_SIZE,
): number {
  return getDataPageCount(recordCount, pageSize)
}

export function paginateWordRecords(
  records: readonly WordRecord[],
  page: number,
  pageSize = WORD_RECORD_PAGE_SIZE,
): WordRecord[] {
  return paginateItems(records, page, pageSize)
}
