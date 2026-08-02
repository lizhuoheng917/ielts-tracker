import { describe, expect, it } from 'vitest'

import { calculateTimerRecordXP, calculateTimerRecordXPDelta } from '@/lib/timerXP'

const minutes = (value: number) => value * 60

describe('timer record XP lifecycle', () => {
  it('awards the earned XP when a 30-minute record is added', () => {
    expect(calculateTimerRecordXPDelta(0, minutes(30))).toBe(15)
  })

  it('adds only the difference when a record is extended', () => {
    expect(calculateTimerRecordXPDelta(minutes(30), minutes(60))).toBe(15)
  })

  it('removes only the difference when a record is shortened', () => {
    expect(calculateTimerRecordXPDelta(minutes(60), minutes(30))).toBe(-15)
  })

  it('removes all XP earned by a deleted record', () => {
    expect(calculateTimerRecordXPDelta(minutes(30), 0)).toBe(-15)
  })

  it('matches the practice XP rounding at the 30-minute boundary', () => {
    expect(calculateTimerRecordXP(minutes(29))).toBe(15)
    expect(calculateTimerRecordXP(minutes(30))).toBe(15)
    expect(calculateTimerRecordXP(minutes(31))).toBe(16)
  })

  it('does not award XP for invalid or sub-minute noise', () => {
    expect(calculateTimerRecordXP(Number.NaN)).toBe(0)
    expect(calculateTimerRecordXP(-minutes(30))).toBe(0)
    expect(calculateTimerRecordXP(59)).toBe(0)
    expect(calculateTimerRecordXP(60)).toBe(1)
  })
})
