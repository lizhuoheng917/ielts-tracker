import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ActivityConsistencyLedgerMeta,
  ActivityConsistencyProjection,
  ActivityConsistencyReport,
} from '@/data/activityConsistency'
import type { ReplayedActivityProjection } from '@/data/activityLedger'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const memoryStorage = new MemoryStorage()

let buildActivityConsistencyReport:
  typeof import('@/data/activityConsistency').buildActivityConsistencyReport
let diagnoseCurrentActivityConsistency:
  typeof import('@/data/activityConsistency').diagnoseCurrentActivityConsistency
let useAchievementStore: typeof import('@/stores/achievementStore').useAchievementStore
let useActivityLedgerStore: typeof import('@/stores/activityLedgerStore').useActivityLedgerStore
let useDailyCheckinStore: typeof import('@/stores/dailyCheckinStore').useDailyCheckinStore
let usePlanStore: typeof import('@/stores/planStore').usePlanStore
let useSettingsStore: typeof import('@/stores/settingsStore').useSettingsStore
let useStreakStore: typeof import('@/stores/streakStore').useStreakStore

const ledgerMeta: ActivityConsistencyLedgerMeta = {
  schemaVersion: 1,
  capturedAt: '2026-08-01T00:00:00.000Z',
  source: 'migration',
  eventCount: 0,
}

function canonicalProjection(): ActivityConsistencyProjection {
  return {
    achievements: { totalXP: 40, level: 1 },
    streak: {
      currentStreak: 2,
      longestStreak: 5,
      lastActiveDate: '2026-08-01',
      heatmapData: { '2026-07-31': 1, '2026-08-01': 2 },
    },
    lastCheckinDate: '2026-08-01',
  }
}

function replayedProjection(): ReplayedActivityProjection {
  return {
    achievements: {
      unlockedBadges: ['baseline-badge'],
      totalXP: 40,
      level: 1,
      statsViewCount: 99,
    },
    streak: {
      currentStreak: 2,
      longestStreak: 5,
      lastActiveDate: '2026-08-01',
      heatmapData: { '2026-07-31': 1, '2026-08-01': 2 },
    },
    lastCheckinDate: '2026-08-01',
    rewardedCheckinDates: ['2026-08-01'],
  }
}

function storageSnapshot() {
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)!)
    .sort()
    .map((key) => [key, localStorage.getItem(key)] as const)
}

function currentStoreSnapshot() {
  const achievements = useAchievementStore.getState()
  const streak = useStreakStore.getState()
  const settings = useSettingsStore.getState()
  const ledger = useActivityLedgerStore.getState()
  const dailyCheckins = useDailyCheckinStore.getState()

  return structuredClone({
    achievements: {
      unlockedBadges: achievements.unlockedBadges,
      totalXP: achievements.totalXP,
      level: achievements.level,
      statsViewCount: achievements.statsViewCount,
    },
    streak: {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastActiveDate: streak.lastActiveDate,
      heatmapData: streak.heatmapData,
    },
    lastCheckinDate: settings.lastCheckinDate,
    dailyCheckins: {
      migrationVersion: dailyCheckins.migrationVersion,
      awards: dailyCheckins.awards,
    },
    executions: usePlanStore.getState().executions,
    ledger: {
      schemaVersion: ledger.schemaVersion,
      baseline: ledger.baseline,
      events: ledger.events,
    },
  })
}

beforeAll(async () => {
  vi.stubGlobal('localStorage', memoryStorage)

  ;({ buildActivityConsistencyReport, diagnoseCurrentActivityConsistency } = await import(
    '@/data/activityConsistency'
  ))
  ;({ useAchievementStore } = await import('@/stores/achievementStore'))
  ;({ useActivityLedgerStore } = await import('@/stores/activityLedgerStore'))
  ;({ useDailyCheckinStore } = await import('@/stores/dailyCheckinStore'))
  ;({ usePlanStore } = await import('@/stores/planStore'))
  ;({ useSettingsStore } = await import('@/stores/settingsStore'))
  ;({ useStreakStore } = await import('@/stores/streakStore'))
})

beforeEach(() => {
  localStorage.clear()
  useAchievementStore.setState({
    unlockedBadges: ['live-badge'],
    totalXP: 40,
    level: 1,
    statsViewCount: 7,
  })
  useStreakStore.setState({
    currentStreak: 2,
    longestStreak: 5,
    lastActiveDate: '2026-08-01',
    heatmapData: { '2026-07-31': 1, '2026-08-01': 2 },
  })
  useSettingsStore.setState({ lastCheckinDate: '2026-08-01' })
  useDailyCheckinStore.setState({
    migrationVersion: 1,
    awards: [{
      id: '2026-08-01',
      date: '2026-08-01',
      awardedXP: 10,
      awardedAt: '2026-08-01T00:00:00.000Z',
      source: 'manual',
    }],
  })
  usePlanStore.setState({
    plans: [],
    executions: [{
      id: 'execution-1',
      planId: 'plan-1',
      date: '2026-08-01',
      isCompleted: true,
    }],
  })
  useActivityLedgerStore.setState({
    schemaVersion: 1,
    baseline: {
      capturedAt: ledgerMeta.capturedAt,
      source: ledgerMeta.source,
      achievements: {
        unlockedBadges: ['baseline-badge'],
        totalXP: 40,
        level: 1,
        statsViewCount: 99,
      },
      streak: canonicalProjection().streak,
      lastCheckinDate: '2026-08-01',
      rewardedCheckinDates: ['2026-08-01'],
    },
    events: [],
  })
})

describe('activity consistency report', () => {
  it('reports a matching projection while excluding unsupported achievement fields', () => {
    const canonical = canonicalProjection()
    const replayed = replayedProjection()
    const canonicalBefore = structuredClone(canonical)
    const replayedBefore = structuredClone(replayed)

    const report = buildActivityConsistencyReport({
      canonical,
      replayed,
      canonicalRewardedCheckinDates: ['2026-08-01'],
      compatibilityCheckinDates: [{ date: '2026-07-31', sources: ['completed-execution'] }],
      ledger: ledgerMeta,
      checkedAt: '2026-08-01T01:00:00.000Z',
      today: '2026-08-01',
    })

    expect(report.status).toBe('consistent')
    expect(report.summary.totalDifferenceCount).toBe(0)
    expect(report.excludedFields).toEqual([
      'achievements.unlockedBadges',
      'achievements.statsViewCount',
    ])
    expect(canonical).toEqual(canonicalBefore)
    expect(replayed).toEqual(replayedBefore)
  })

  it('reports every supported scalar projection difference', () => {
    const replayed = replayedProjection()
    replayed.achievements.totalXP = 45
    replayed.achievements.level = 2
    replayed.streak.currentStreak = 3
    replayed.streak.longestStreak = 6
    replayed.streak.lastActiveDate = '2026-08-02'
    replayed.lastCheckinDate = '2026-08-02'

    const report = buildActivityConsistencyReport({
      canonical: canonicalProjection(),
      replayed,
      canonicalRewardedCheckinDates: ['2026-08-01'],
      compatibilityCheckinDates: [],
      ledger: ledgerMeta,
      checkedAt: '2026-08-01T01:00:00.000Z',
      today: '2026-08-01',
    })

    expect(report.status).toBe('drift')
    expect(report.scalarDifferences.map((difference) => difference.field)).toEqual([
      'achievements.totalXP',
      'achievements.level',
      'streak.currentStreak',
      'streak.longestStreak',
      'streak.lastActiveDate',
      'settings.lastCheckinDate',
    ])
    expect(report.scalarDifferences[0].delta).toBe(5)
  })

  it('classifies missing, extra and mismatched heatmap dates', () => {
    const canonical = canonicalProjection()
    canonical.streak.heatmapData = {
      '2026-08-01': 2,
      '2026-08-02': 1,
    }
    const replayed = replayedProjection()
    replayed.streak.heatmapData = {
      '2026-08-02': 3,
      '2026-08-03': 1,
    }

    const report = buildActivityConsistencyReport({
      canonical,
      replayed,
      canonicalRewardedCheckinDates: ['2026-08-01'],
      compatibilityCheckinDates: [],
      ledger: ledgerMeta,
      checkedAt: '2026-08-01T01:00:00.000Z',
      today: '2026-08-01',
    })

    expect(report.heatmapDifferences.map(({ date, kind }) => ({ date, kind }))).toEqual([
      { date: '2026-08-03', kind: 'extra-in-ledger' },
      { date: '2026-08-02', kind: 'count-mismatch' },
      { date: '2026-08-01', kind: 'missing-in-ledger' },
    ])
  })

  it('compares the complete canonical and replayed rewarded-date sets in both directions', () => {
    const replayed = replayedProjection()
    replayed.rewardedCheckinDates = ['2026-08-01', '2026-07-30']

    const report = buildActivityConsistencyReport({
      canonical: canonicalProjection(),
      replayed,
      canonicalRewardedCheckinDates: ['2026-08-01', '2026-07-31'],
      compatibilityCheckinDates: [
        { date: '2026-07-31', sources: ['completed-execution'] },
        { date: '2026-07-30', sources: ['last-checkin'] },
      ],
      ledger: ledgerMeta,
      checkedAt: '2026-08-01T01:00:00.000Z',
      today: '2026-08-01',
    })

    expect(report.checkinDifferences).toEqual([
      {
        date: '2026-07-31',
        kind: 'missing-in-ledger',
        compatibilitySources: ['completed-execution'],
      },
      {
        date: '2026-07-30',
        kind: 'extra-in-ledger',
        compatibilitySources: ['last-checkin'],
      },
    ])
  })

  it('diagnoses current stores without changing stores or localStorage', () => {
    const storesBefore = currentStoreSnapshot()
    const storageBefore = storageSnapshot()

    const report = diagnoseCurrentActivityConsistency({
      today: '2026-08-01',
      checkedAt: '2026-08-01T02:00:00.000Z',
    })

    expect(report.status).toBe('consistent')
    expect(currentStoreSnapshot()).toEqual(storesBefore)
    expect(storageSnapshot()).toEqual(storageBefore)
  })

  it('returns unavailable without initializing a missing ledger', () => {
    useActivityLedgerStore.setState({ baseline: null, events: [] })
    const storesBefore = currentStoreSnapshot()
    const storageBefore = storageSnapshot()

    const report: ActivityConsistencyReport = diagnoseCurrentActivityConsistency({
      today: '2026-08-01',
      checkedAt: '2026-08-01T02:00:00.000Z',
    })

    expect(report.status).toBe('unavailable')
    expect(report.unavailableReason).toBe('ledger-not-initialized')
    expect(currentStoreSnapshot()).toEqual(storesBefore)
    expect(storageSnapshot()).toEqual(storageBefore)
  })
})
