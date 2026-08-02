import type { TimerRecord, TimerSubject } from '@/lib/types'

export type TimerRecordSortOrder =
  | 'newest'
  | 'oldest'
  | 'duration-desc'
  | 'duration-asc'

export interface TimerRecordFilters {
  searchQuery: string
  subject: TimerSubject | 'all'
  dateFrom: string
  dateTo: string
  sortOrder: TimerRecordSortOrder
}

export function resolveTimerRecordDuration(
  originalDurationSeconds: number,
  durationMinutes: string,
  durationEdited: boolean,
): number | undefined {
  const minutes = Number.parseInt(durationMinutes, 10)
  if (!Number.isInteger(minutes) || minutes <= 0) return undefined

  return durationEdited ? minutes * 60 : originalDurationSeconds
}

export function filterAndSortTimerRecords(
  records: readonly TimerRecord[],
  filters: TimerRecordFilters,
): TimerRecord[] {
  const normalizedQuery = filters.searchQuery.trim().toLocaleLowerCase('zh-CN')

  return records
    .filter((record) => {
      const matchesSubject =
        filters.subject === 'all' || record.subject === filters.subject
      const matchesStartDate = !filters.dateFrom || record.date >= filters.dateFrom
      const matchesEndDate = !filters.dateTo || record.date <= filters.dateTo
      const searchableText = [record.date, record.note]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')
      const matchesQuery =
        !normalizedQuery || searchableText.includes(normalizedQuery)

      return (
        matchesSubject &&
        matchesStartDate &&
        matchesEndDate &&
        matchesQuery
      )
    })
    .sort((a, b) => {
      if (filters.sortOrder === 'oldest') {
        return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      }
      if (filters.sortOrder === 'duration-desc') {
        return b.duration - a.duration || b.date.localeCompare(a.date)
      }
      if (filters.sortOrder === 'duration-asc') {
        return a.duration - b.duration || b.date.localeCompare(a.date)
      }
      return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
    })
}
