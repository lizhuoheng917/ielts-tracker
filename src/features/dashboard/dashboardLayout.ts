export const DASHBOARD_CARD_IDS = [
  'words-summary',
  'exam-countdown',
  'ai-suggestions',
  'today-tasks',
  'recent-activity',
  'recent-achievements',
  'level-progress',
  'latest-diary',
] as const

export type DashboardCardId = (typeof DASHBOARD_CARD_IDS)[number]
export type DashboardCardVisibility = Record<DashboardCardId, boolean>

export const DEFAULT_DASHBOARD_CARD_ORDER: DashboardCardId[] = [...DASHBOARD_CARD_IDS]

export const DEFAULT_DASHBOARD_CARD_VISIBILITY: DashboardCardVisibility = {
  'words-summary': true,
  'exam-countdown': true,
  'ai-suggestions': true,
  'today-tasks': true,
  'recent-activity': true,
  'recent-achievements': true,
  'level-progress': true,
  'latest-diary': true,
}

const DASHBOARD_CARD_WIDTH: Record<DashboardCardId, 4 | 6 | 8 | 12> = {
  'words-summary': 12,
  'exam-countdown': 6,
  'ai-suggestions': 6,
  'today-tasks': 8,
  'recent-activity': 4,
  'recent-achievements': 4,
  'level-progress': 4,
  'latest-diary': 4,
}

export function isDashboardCardId(value: unknown): value is DashboardCardId {
  return typeof value === 'string'
    && (DASHBOARD_CARD_IDS as readonly string[]).includes(value)
}

/** Keeps valid user order, removes duplicates and appends cards added by later releases. */
export function normalizeDashboardCardOrder(value: unknown): DashboardCardId[] {
  const normalized: DashboardCardId[] = []
  const seen = new Set<DashboardCardId>()

  if (Array.isArray(value)) {
    value.forEach((candidate) => {
      if (!isDashboardCardId(candidate) || seen.has(candidate)) return
      normalized.push(candidate)
      seen.add(candidate)
    })
  }

  DASHBOARD_CARD_IDS.forEach((cardId) => {
    if (seen.has(cardId)) return
    normalized.push(cardId)
    seen.add(cardId)
  })

  return normalized
}

export function normalizeDashboardCardVisibility(
  value: unknown,
  fallback: Partial<DashboardCardVisibility> = {},
): DashboardCardVisibility {
  const source = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}

  return Object.fromEntries(DASHBOARD_CARD_IDS.map((cardId) => {
    const candidate = source[cardId]
    if (typeof candidate === 'boolean') return [cardId, candidate]
    if (typeof fallback[cardId] === 'boolean') return [cardId, fallback[cardId]]
    return [cardId, DEFAULT_DASHBOARD_CARD_VISIBILITY[cardId]]
  })) as DashboardCardVisibility
}

export function normalizeDashboardSettings(input: {
  order?: unknown
  visibility?: unknown
  legacyVisibility?: Partial<DashboardCardVisibility>
}): {
  order: DashboardCardId[]
  visibility: DashboardCardVisibility
} {
  return {
    order: normalizeDashboardCardOrder(input.order),
    visibility: normalizeDashboardCardVisibility(input.visibility, input.legacyVisibility),
  }
}

export function moveDashboardCard(
  order: unknown,
  cardId: DashboardCardId,
  direction: 'up' | 'down',
): DashboardCardId[] {
  const normalized = normalizeDashboardCardOrder(order)
  const currentIndex = normalized.indexOf(cardId)
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= normalized.length) return normalized

  const next = [...normalized]
  ;[next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]]
  return next
}

/**
 * Packs cards into balanced desktop rows without changing their configured
 * sequence. Every row naturally collapses to a single column on mobile.
 */
export function createDashboardCardRows(order: readonly DashboardCardId[]): DashboardCardId[][] {
  const rows: DashboardCardId[][] = []
  let pendingRow: DashboardCardId[] = []
  let pendingWidth = 0

  const flushRow = () => {
    if (pendingRow.length === 0) return
    rows.push(pendingRow)
    pendingRow = []
    pendingWidth = 0
  }

  order.forEach((cardId) => {
    const width = DASHBOARD_CARD_WIDTH[cardId]
    if (width === 12) flushRow()
    if (pendingWidth + width > 12) flushRow()

    pendingRow.push(cardId)
    pendingWidth += width
    if (pendingWidth === 12) flushRow()
  })
  flushRow()

  return rows
}

export function dashboardCardColumnClass(
  row: readonly DashboardCardId[],
  cardId: DashboardCardId,
): string {
  if (row.length <= 1) return 'lg:col-span-12'
  if (row.length >= 3) return 'lg:col-span-4'
  if (row.includes('today-tasks')) {
    return cardId === 'today-tasks' ? 'lg:col-span-8' : 'lg:col-span-4'
  }
  return 'lg:col-span-6'
}
