import { describe, expect, it, vi } from 'vitest'

import {
  createWordsDailySummaryPreview,
  loadWordsDailySummary,
  parseWordsDailySummary,
} from './wordsDailySummary'

const studyDate = '2026-08-12'

describe('Lexi Words daily summary boundary', () => {
  it('accepts the exact V1 cloud-only summary for the requested day', () => {
    const value = createWordsDailySummaryPreview(studyDate)
    expect(parseWordsDailySummary(value, studyDate)).toEqual(value)
  })

  it('rejects stale days, product mismatches and impossible counters', () => {
    const value = createWordsDailySummaryPreview(studyDate)

    expect(() => parseWordsDailySummary({ ...value, studyDate: '2026-08-11' }, studyDate)).toThrow()
    expect(() => parseWordsDailySummary({ ...value, product: 'tracker' }, studyDate)).toThrow()
    expect(() => parseWordsDailySummary({ ...value, passed: value.attempts + 1 }, studyDate)).toThrow()
    expect(() => parseWordsDailySummary({ ...value, dueWords: value.masteredWords + 1 }, studyDate)).toThrow()
    expect(() => parseWordsDailySummary({ ...value, attempts: -1 }, studyDate)).toThrow()
  })

  it('passes only the current account and local date to the injected RPC', async () => {
    const invoke = vi.fn(async () => createWordsDailySummaryPreview(studyDate))

    await expect(loadWordsDailySummary('user-1', studyDate, invoke)).resolves.toMatchObject({
      product: 'words',
      studyDate,
      attempts: 42,
    })
    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith({
      expectedUserId: 'user-1',
      studyDate,
    })
  })

  it('does not invoke the backend for an empty account or invalid date', async () => {
    const invoke = vi.fn(async () => createWordsDailySummaryPreview(studyDate))

    await expect(loadWordsDailySummary('', studyDate, invoke)).rejects.toThrow()
    await expect(loadWordsDailySummary('user-1', '12/08/2026', invoke)).rejects.toThrow()
    await expect(loadWordsDailySummary('user-1', '2026-02-30', invoke)).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })
})
