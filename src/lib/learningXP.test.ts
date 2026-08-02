import { describe, expect, it } from 'vitest'

import {
  calculatePracticeRecordXP,
  calculatePracticeRecordXPDelta,
  calculateWordRecordXP,
  calculateWordRecordXPDelta,
  levelForXP,
} from '@/lib/learningXP'

describe('word record XP lifecycle', () => {
  it('keeps the existing rounded absolute award rule', () => {
    expect(calculateWordRecordXP(1)).toBe(1)
    expect(calculateWordRecordXP(5)).toBe(3)
    expect(calculateWordRecordXP(9)).toBe(5)
    expect(calculateWordRecordXP(10)).toBe(5)
    expect(calculateWordRecordXP(11)).toBe(6)
  })

  it('uses the difference between absolute awards for reversible edits', () => {
    const added = calculateWordRecordXPDelta(0, 5)
    const extended = calculateWordRecordXPDelta(5, 10)
    const deleted = calculateWordRecordXPDelta(10, 0)

    expect(added).toBe(3)
    expect(extended).toBe(2)
    expect(deleted).toBe(-5)
    expect(added + extended + deleted).toBe(0)
  })

  it('does not award invalid or non-positive values', () => {
    expect(calculateWordRecordXP(0)).toBe(0)
    expect(calculateWordRecordXP(-10)).toBe(0)
    expect(calculateWordRecordXP(Number.NaN)).toBe(0)
    expect(calculateWordRecordXP(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('practice record XP lifecycle', () => {
  it('keeps the existing rounded absolute award rule', () => {
    expect(calculatePracticeRecordXP(1)).toBe(1)
    expect(calculatePracticeRecordXP(15)).toBe(8)
    expect(calculatePracticeRecordXP(29)).toBe(15)
    expect(calculatePracticeRecordXP(30)).toBe(15)
    expect(calculatePracticeRecordXP(31)).toBe(16)
  })

  it('uses the difference between absolute awards for reversible edits', () => {
    const added = calculatePracticeRecordXPDelta(0, 15)
    const extended = calculatePracticeRecordXPDelta(15, 30)
    const deleted = calculatePracticeRecordXPDelta(30, 0)

    expect(added).toBe(8)
    expect(extended).toBe(7)
    expect(deleted).toBe(-15)
    expect(added + extended + deleted).toBe(0)
  })

  it('does not award invalid or non-positive values', () => {
    expect(calculatePracticeRecordXP(0)).toBe(0)
    expect(calculatePracticeRecordXP(-30)).toBe(0)
    expect(calculatePracticeRecordXP(Number.NaN)).toBe(0)
    expect(calculatePracticeRecordXP(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('levelForXP', () => {
  it('uses level thresholds inclusively', () => {
    expect(levelForXP(0)).toBe(1)
    expect(levelForXP(99)).toBe(1)
    expect(levelForXP(100)).toBe(2)
    expect(levelForXP(299)).toBe(2)
    expect(levelForXP(300)).toBe(3)
    expect(levelForXP(5_500)).toBe(10)
    expect(levelForXP(100_000)).toBe(10)
  })

  it('treats negative and non-finite XP as zero', () => {
    expect(levelForXP(-1)).toBe(1)
    expect(levelForXP(Number.NaN)).toBe(1)
    expect(levelForXP(Number.POSITIVE_INFINITY)).toBe(1)
  })
})
