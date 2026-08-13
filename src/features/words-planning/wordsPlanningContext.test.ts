import { describe, expect, it, vi } from 'vitest'

import {
  createWordsPlanningContextPreview,
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
})
