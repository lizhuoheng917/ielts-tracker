import { describe, expect, it, vi } from 'vitest'

import {
  createWordsPlanningContextPreview,
  describeWordsExecutionProgress,
  loadWordsPlanningContext,
  parseWordsPlanningContext,
} from './wordsPlanningContext'

const targetDate = '2026-08-13'
const timeZone = 'Asia/Shanghai'

describe('Words planning context boundary', () => {
  it('accepts the compact numeric projection', () => {
    const value = createWordsPlanningContextPreview(targetDate, timeZone)
    expect(parseWordsPlanningContext(value, targetDate, timeZone)).toEqual(value)
  })

  it('rejects identity drift, extra data and inconsistent counts', () => {
    const value = createWordsPlanningContextPreview(targetDate, timeZone)
    expect(() => parseWordsPlanningContext({ ...value, product: 'tracker' }, targetDate, timeZone)).toThrow()
    expect(() => parseWordsPlanningContext({ ...value, targetDate: '2026-08-14' }, targetDate, timeZone)).toThrow()
    expect(() => parseWordsPlanningContext({ ...value, wordTexts: ['private'] }, targetDate, timeZone)).toThrow(/unsupported fields/)
    expect(() => parseWordsPlanningContext({
      ...value,
      inventory: { ...value.inventory, dueByTargetWords: value.inventory.masteredWords + 1 },
    }, targetDate, timeZone)).toThrow(/inconsistent/)
    expect(() => parseWordsPlanningContext({
      ...value,
      recent7Days: { ...value.recent7Days, attempts: -1 },
    }, targetDate, timeZone)).toThrow(/invalid/)
    expect(() => parseWordsPlanningContext({
      ...value,
      targetDay: { ...value.targetDay, completedNewWords: value.targetDay.plannedNewWords + 1 },
    }, targetDate, timeZone)).toThrow(/inconsistent/)
  })

  it('calls the owner-scoped RPC input exactly once and validates the response', async () => {
    const invoke = vi.fn(async () => createWordsPlanningContextPreview(targetDate, timeZone))
    await expect(loadWordsPlanningContext('user-701', targetDate, timeZone, invoke)).resolves.toMatchObject({
      product: 'words',
      targetDate,
      timeZone,
    })
    expect(invoke).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith({
      expectedUserId: 'user-701',
      targetDate,
      timeZone,
    })
  })

  it('rejects malformed requests before invoking Supabase', async () => {
    const invoke = vi.fn()
    await expect(loadWordsPlanningContext('', targetDate, timeZone, invoke)).rejects.toThrow(/invalid/)
    await expect(loadWordsPlanningContext('user-701', '13/08/2026', timeZone, invoke)).rejects.toThrow(/invalid/)
    await expect(loadWordsPlanningContext('user-701', targetDate, 'x'.repeat(65), invoke)).rejects.toThrow(/invalid/)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('derives today progress from the existing non-persisted summary', () => {
    const context = createWordsPlanningContextPreview(targetDate, timeZone)
    expect(describeWordsExecutionProgress(context)).toEqual({
      plannedWords: 30,
      completedWords: 12,
      remainingWords: 18,
      completionRate: 40,
      plannedNewWords: 12,
      completedNewWords: 4,
      plannedReviewWords: 18,
      completedReviewWords: 8,
    })
  })

  it('describes a day without a confirmed Words target without inventing progress', () => {
    const context = createWordsPlanningContextPreview(targetDate, timeZone)
    context.targetDay = {
      ...context.targetDay,
      plannedNewWords: 0,
      plannedReviewWords: 0,
      completedNewWords: 0,
      completedReviewWords: 0,
    }
    expect(describeWordsExecutionProgress(context)).toMatchObject({
      plannedWords: 0,
      completedWords: 0,
      remainingWords: 0,
      completionRate: null,
    })
  })
})
