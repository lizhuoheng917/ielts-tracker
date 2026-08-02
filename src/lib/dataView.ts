export const DEFAULT_DATA_PAGE_SIZE = 50

export function getDataPageCount(
  itemCount: number,
  pageSize = DEFAULT_DATA_PAGE_SIZE,
): number {
  return Math.max(1, Math.ceil(itemCount / pageSize))
}

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize = DEFAULT_DATA_PAGE_SIZE,
): T[] {
  const resolvedPage = Math.max(1, Math.floor(page))
  const start = (resolvedPage - 1) * pageSize
  return items.slice(start, start + pageSize)
}
