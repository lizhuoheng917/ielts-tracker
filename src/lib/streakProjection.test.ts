import { describe, expect, it } from 'vitest'

import {
  applyActivityDelta,
  calculateStreakEndingOn,
  deriveStreakData,
} from '@/lib/streakProjection'

describe('applyActivityDelta', () => {
  it('adds and removes one source contribution without mutating the input', () => {
    const original = { '2026-08-01': 1 }
    const added = applyActivityDelta(original, '2026-08-01', 1)
    const removed = applyActivityDelta(added, '2026-08-01', -2)

    expect(original).toEqual({ '2026-08-01': 1 })
    expect(added).toEqual({ '2026-08-01': 2 })
    expect(removed).toEqual({})
  })

  it('supports moving an activity between dates with two deltas', () => {
    const original = { '2026-07-31': 2, '2026-08-01': 1 }
    const removedFromOldDate = applyActivityDelta(original, '2026-07-31', -1)
    const moved = applyActivityDelta(removedFromOldDate, '2026-08-01', 1)

    expect(moved).toEqual({ '2026-07-31': 1, '2026-08-01': 2 })
  })

  it('drops invalid dates and non-positive or fractional counts', () => {
    const result = applyActivityDelta(
      {
        '2026-08-01': 2,
        '2026-08-02': 0,
        '2026-08-03': -1,
        '2026-08-04': 1.5,
        invalid: 3,
      },
      'also-invalid',
      1,
    )

    expect(result).toEqual({ '2026-08-01': 2 })
  })
})

describe('calculateStreakEndingOn', () => {
  it('counts consecutive days across month boundaries', () => {
    const heatmap = {
      '2026-07-30': 1,
      '2026-07-31': 2,
      '2026-08-01': 1,
    }

    expect(calculateStreakEndingOn(heatmap, '2026-08-01')).toBe(3)
    expect(calculateStreakEndingOn(heatmap, '2026-08-02')).toBe(0)
  })
})

describe('deriveStreakData', () => {
  it('derives current streak from today and longest streak from all history', () => {
    const result = deriveStreakData(
      {
        '2026-06-28': 1,
        '2026-06-29': 1,
        '2026-06-30': 1,
        '2026-07-01': 1,
        '2026-07-30': 1,
        '2026-07-31': 1,
        '2026-08-01': 2,
      },
      '2026-08-01',
    )

    expect(result.currentStreak).toBe(3)
    expect(result.longestStreak).toBe(4)
    expect(result.lastActiveDate).toBe('2026-08-01')
  })

  it('returns a normalized empty projection when no valid activity exists', () => {
    expect(deriveStreakData({ '2026-08-01': 0, invalid: 1 }, '2026-08-01')).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastActiveDate: '',
      heatmapData: {},
    })
  })
})
