import { describe, expect, it } from 'vitest'
import { addLocalDays, isLocalDate, parseLocalDate, toLocalDate } from './localDate'

describe('localDate', () => {
  it('uses local calendar fields instead of converting through UTC', () => {
    const justAfterLocalMidnight = new Date(2026, 7, 1, 0, 5)
    expect(toLocalDate(justAfterLocalMidnight)).toBe('2026-08-01')
  })

  it('rejects impossible calendar dates', () => {
    expect(isLocalDate('2026-02-29')).toBe(false)
    expect(isLocalDate('2028-02-29')).toBe(true)
  })

  it('parses and shifts dates in local calendar time', () => {
    const parsed = parseLocalDate('2026-08-01')
    expect(parsed.getFullYear()).toBe(2026)
    expect(parsed.getMonth()).toBe(7)
    expect(parsed.getDate()).toBe(1)
    expect(addLocalDays('2026-08-01', -1)).toBe('2026-07-31')
  })
})
