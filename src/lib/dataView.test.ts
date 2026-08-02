import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DATA_PAGE_SIZE,
  getDataPageCount,
  paginateItems,
} from './dataView'

describe('dataView', () => {
  it('keeps large datasets bounded to the shared page size', () => {
    const items = Array.from({ length: 5_000 }, (_, index) => index)

    expect(DEFAULT_DATA_PAGE_SIZE).toBe(50)
    expect(getDataPageCount(items.length)).toBe(100)
    expect(paginateItems(items, 1)).toEqual(items.slice(0, 50))
    expect(paginateItems(items, 100)).toEqual(items.slice(4_950, 5_000))
  })

  it('normalizes pages below one and leaves an empty dataset on one page', () => {
    expect(paginateItems([1, 2, 3], 0)).toEqual([1, 2, 3])
    expect(getDataPageCount(0)).toBe(1)
  })
})
