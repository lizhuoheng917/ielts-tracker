import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_CARD_IDS,
  createDashboardCardRows,
  dashboardCardColumnClass,
  moveDashboardCard,
  normalizeDashboardCardOrder,
  normalizeDashboardSettings,
  normalizeDashboardCardVisibility,
} from './dashboardLayout'

describe('dashboard personalization layout', () => {
  it('keeps valid order while repairing duplicates, unknown ids and newly added cards', () => {
    expect(normalizeDashboardCardOrder([
      'today-tasks',
      'words-summary',
      'today-tasks',
      'unknown-card',
    ])).toEqual([
      'today-tasks',
      'words-summary',
      'exam-countdown',
      'ai-suggestions',
      'recent-activity',
      'recent-achievements',
      'level-progress',
      'latest-diary',
    ])
  })

  it('moves cards one position without crossing the list boundaries', () => {
    expect(moveDashboardCard(DASHBOARD_CARD_IDS, 'today-tasks', 'up')[2]).toBe('today-tasks')
    expect(moveDashboardCard(DASHBOARD_CARD_IDS, 'words-summary', 'up'))
      .toEqual(DASHBOARD_CARD_IDS)
    expect(moveDashboardCard(DASHBOARD_CARD_IDS, 'latest-diary', 'down'))
      .toEqual(DASHBOARD_CARD_IDS)
  })

  it('defaults missing visibility while preserving explicit and legacy choices', () => {
    const visibility = normalizeDashboardCardVisibility(
      { 'today-tasks': false },
      { 'words-summary': false },
    )

    expect(visibility['today-tasks']).toBe(false)
    expect(visibility['words-summary']).toBe(false)
    expect(visibility['recent-activity']).toBe(true)
  })

  it('migrates the three legacy switches into the expanded card settings', () => {
    const settings = normalizeDashboardSettings({
      order: undefined,
      visibility: undefined,
      legacyVisibility: {
        'words-summary': false,
        'exam-countdown': false,
        'ai-suggestions': true,
      },
    })

    expect(settings.order).toEqual(DASHBOARD_CARD_IDS)
    expect(settings.visibility['words-summary']).toBe(false)
    expect(settings.visibility['exam-countdown']).toBe(false)
    expect(settings.visibility['ai-suggestions']).toBe(true)
    expect(settings.visibility['today-tasks']).toBe(true)
  })

  it('keeps configured order while packing cards into balanced desktop rows', () => {
    expect(createDashboardCardRows([
      'today-tasks',
      'words-summary',
      'ai-suggestions',
      'recent-activity',
      'recent-achievements',
      'level-progress',
      'latest-diary',
    ])).toEqual([
      ['today-tasks'],
      ['words-summary'],
      ['ai-suggestions', 'recent-activity'],
      ['recent-achievements', 'level-progress', 'latest-diary'],
    ])
  })

  it('expands incomplete rows and preserves the default tasks/activity balance', () => {
    expect(dashboardCardColumnClass(['recent-activity'], 'recent-activity')).toBe('lg:col-span-12')
    expect(dashboardCardColumnClass(['exam-countdown', 'ai-suggestions'], 'ai-suggestions'))
      .toBe('lg:col-span-6')
    expect(dashboardCardColumnClass(['today-tasks', 'recent-activity'], 'today-tasks'))
      .toBe('lg:col-span-8')
    expect(dashboardCardColumnClass(['today-tasks', 'recent-activity'], 'recent-activity'))
      .toBe('lg:col-span-4')
  })
})
