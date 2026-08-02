import type { PracticeRecord, PracticeType } from '@/lib/types'

export const IELTS_SCORE_SLIDER_MAX = 17

export function normalizeIeltsScore(score: number): number | undefined {
  if (!Number.isFinite(score) || score <= 0) return undefined
  return Math.min(9, Math.max(1, Math.round(score * 2) / 2))
}

export function scoreToSliderIndex(score: number): number {
  const normalizedScore = normalizeIeltsScore(score)
  if (normalizedScore === undefined) return 0
  return Math.round((normalizedScore - 1) * 2) + 1
}

export function sliderIndexToScore(index: number): number {
  if (!Number.isFinite(index)) return 0
  const normalizedIndex = Math.min(
    IELTS_SCORE_SLIDER_MAX,
    Math.max(0, Math.round(index)),
  )
  return normalizedIndex === 0 ? 0 : 1 + (normalizedIndex - 1) * 0.5
}

export type PracticeRecordSortOrder =
  | 'newest'
  | 'oldest'
  | 'score-desc'
  | 'score-asc'
  | 'duration-desc'
  | 'duration-asc'

export interface PracticeRecordFilters {
  type: PracticeType
  searchQuery: string
  dateFrom: string
  dateTo: string
  sortOrder: PracticeRecordSortOrder
}

function compareByNewest(a: PracticeRecord, b: PracticeRecord): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
}

function compareScore(
  a: PracticeRecord,
  b: PracticeRecord,
  direction: 'asc' | 'desc',
): number {
  const aHasScore = typeof a.score === 'number' && a.score > 0
  const bHasScore = typeof b.score === 'number' && b.score > 0

  if (aHasScore !== bHasScore) return aHasScore ? -1 : 1
  if (!aHasScore || !bHasScore) return compareByNewest(a, b)

  const scoreDifference = direction === 'desc'
    ? (b.score ?? 0) - (a.score ?? 0)
    : (a.score ?? 0) - (b.score ?? 0)

  return scoreDifference || compareByNewest(a, b)
}

export function filterAndSortPracticeRecords(
  records: readonly PracticeRecord[],
  filters: PracticeRecordFilters,
): PracticeRecord[] {
  const normalizedQuery = filters.searchQuery.trim().toLocaleLowerCase('zh-CN')

  return records
    .filter((record) => {
      if (record.type !== filters.type) return false

      const searchableText = [record.date, record.topic, record.note]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')

      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery)
      const matchesStartDate = !filters.dateFrom || record.date >= filters.dateFrom
      const matchesEndDate = !filters.dateTo || record.date <= filters.dateTo

      return matchesQuery && matchesStartDate && matchesEndDate
    })
    .sort((a, b) => {
      if (filters.sortOrder === 'oldest') {
        return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      }
      if (filters.sortOrder === 'score-desc') return compareScore(a, b, 'desc')
      if (filters.sortOrder === 'score-asc') return compareScore(a, b, 'asc')
      if (filters.sortOrder === 'duration-desc') {
        return b.duration - a.duration || compareByNewest(a, b)
      }
      if (filters.sortOrder === 'duration-asc') {
        return a.duration - b.duration || compareByNewest(a, b)
      }
      return compareByNewest(a, b)
    })
}
