import {
  replayActivityLedger,
  type ActivityEventSource,
  type ActivityLedgerSnapshot,
  type ReplayedActivityProjection,
} from '@/data/activityLedger'
import { toLocalDate } from '@/lib/localDate'
import type { StreakData } from '@/lib/types'
import { useAchievementStore } from '@/stores/achievementStore'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { usePlanStore } from '@/stores/planStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'

export const ACTIVITY_CONSISTENCY_EXCLUDED_FIELDS = [
  'achievements.unlockedBadges',
  'achievements.statsViewCount',
] as const

export type ActivityConsistencyStatus = 'consistent' | 'drift' | 'unavailable'

export type ActivityConsistencyScalarField =
  | 'achievements.totalXP'
  | 'achievements.level'
  | 'streak.currentStreak'
  | 'streak.longestStreak'
  | 'streak.lastActiveDate'
  | 'settings.lastCheckinDate'

export interface ActivityConsistencyProjection {
  achievements: {
    totalXP: number
    level: number
  }
  streak: StreakData
  lastCheckinDate?: string
}

export interface ActivityConsistencyLedgerMeta {
  schemaVersion: ActivityLedgerSnapshot['schemaVersion']
  capturedAt: string
  source: ActivityEventSource
  eventCount: number
}

export interface ActivityConsistencyScalarDifference {
  field: ActivityConsistencyScalarField
  canonicalValue: number | string | null
  replayedValue: number | string | null
  delta?: number
}

export type ActivityConsistencyHeatmapDifferenceKind =
  | 'missing-in-ledger'
  | 'extra-in-ledger'
  | 'count-mismatch'

export interface ActivityConsistencyHeatmapDifference {
  date: string
  kind: ActivityConsistencyHeatmapDifferenceKind
  canonicalCount: number
  replayedCount: number
  delta: number
}

export type ActivityConsistencyCheckinCompatibilitySource =
  | 'completed-execution'
  | 'last-checkin'

export interface ActivityConsistencyCheckinCompatibilityHint {
  date: string
  sources: ActivityConsistencyCheckinCompatibilitySource[]
}

export type ActivityConsistencyCheckinDifferenceKind =
  | 'missing-in-ledger'
  | 'extra-in-ledger'

export interface ActivityConsistencyCheckinDifference {
  date: string
  kind: ActivityConsistencyCheckinDifferenceKind
  compatibilitySources: ActivityConsistencyCheckinCompatibilitySource[]
}

export interface ActivityConsistencyReport {
  status: ActivityConsistencyStatus
  checkedAt: string
  today: string
  unavailableReason?: 'ledger-not-initialized' | 'replay-failed'
  ledger?: ActivityConsistencyLedgerMeta
  scalarDifferences: ActivityConsistencyScalarDifference[]
  heatmapDifferences: ActivityConsistencyHeatmapDifference[]
  checkinDifferences: ActivityConsistencyCheckinDifference[]
  summary: {
    scalarFieldCount: number
    heatmapDateCount: number
    checkinDateCount: number
    totalDifferenceCount: number
  }
  excludedFields: typeof ACTIVITY_CONSISTENCY_EXCLUDED_FIELDS
}

interface ActivityConsistencyReportInput {
  canonical: ActivityConsistencyProjection
  replayed: ReplayedActivityProjection
  canonicalRewardedCheckinDates: string[]
  compatibilityCheckinDates: ActivityConsistencyCheckinCompatibilityHint[]
  ledger: ActivityConsistencyLedgerMeta
  checkedAt: string
  today: string
}

interface DiagnoseActivityConsistencyOptions {
  today?: string
  checkedAt?: string
}

function optionalDate(value: string | undefined): string | null {
  return value || null
}

function createUnavailableReport(
  checkedAt: string,
  today: string,
  unavailableReason: NonNullable<ActivityConsistencyReport['unavailableReason']>,
  ledger?: ActivityConsistencyLedgerMeta,
): ActivityConsistencyReport {
  return {
    status: 'unavailable',
    checkedAt,
    today,
    unavailableReason,
    ledger,
    scalarDifferences: [],
    heatmapDifferences: [],
    checkinDifferences: [],
    summary: {
      scalarFieldCount: 0,
      heatmapDateCount: 0,
      checkinDateCount: 0,
      totalDifferenceCount: 0,
    },
    excludedFields: ACTIVITY_CONSISTENCY_EXCLUDED_FIELDS,
  }
}

export function buildActivityConsistencyReport({
  canonical,
  replayed,
  canonicalRewardedCheckinDates,
  compatibilityCheckinDates,
  ledger,
  checkedAt,
  today,
}: ActivityConsistencyReportInput): ActivityConsistencyReport {
  const scalarComparisons: Array<{
    field: ActivityConsistencyScalarField
    canonicalValue: number | string | null
    replayedValue: number | string | null
  }> = [
    {
      field: 'achievements.totalXP',
      canonicalValue: canonical.achievements.totalXP,
      replayedValue: replayed.achievements.totalXP,
    },
    {
      field: 'achievements.level',
      canonicalValue: canonical.achievements.level,
      replayedValue: replayed.achievements.level,
    },
    {
      field: 'streak.currentStreak',
      canonicalValue: canonical.streak.currentStreak,
      replayedValue: replayed.streak.currentStreak,
    },
    {
      field: 'streak.longestStreak',
      canonicalValue: canonical.streak.longestStreak,
      replayedValue: replayed.streak.longestStreak,
    },
    {
      field: 'streak.lastActiveDate',
      canonicalValue: optionalDate(canonical.streak.lastActiveDate),
      replayedValue: optionalDate(replayed.streak.lastActiveDate),
    },
    {
      field: 'settings.lastCheckinDate',
      canonicalValue: optionalDate(canonical.lastCheckinDate),
      replayedValue: optionalDate(replayed.lastCheckinDate),
    },
  ]

  const scalarDifferences = scalarComparisons.flatMap((comparison) => {
    if (Object.is(comparison.canonicalValue, comparison.replayedValue)) return []

    const delta = typeof comparison.canonicalValue === 'number'
      && typeof comparison.replayedValue === 'number'
      ? comparison.replayedValue - comparison.canonicalValue
      : undefined
    return [{ ...comparison, delta }]
  })

  const heatmapDates = new Set([
    ...Object.keys(canonical.streak.heatmapData),
    ...Object.keys(replayed.streak.heatmapData),
  ])
  const heatmapDifferences = [...heatmapDates]
    .sort((left, right) => right.localeCompare(left))
    .flatMap((date): ActivityConsistencyHeatmapDifference[] => {
      const canonicalCount = canonical.streak.heatmapData[date] ?? 0
      const replayedCount = replayed.streak.heatmapData[date] ?? 0
      if (canonicalCount === replayedCount) return []

      const kind: ActivityConsistencyHeatmapDifferenceKind = canonicalCount > 0
        && replayedCount === 0
        ? 'missing-in-ledger'
        : canonicalCount === 0 && replayedCount > 0
          ? 'extra-in-ledger'
          : 'count-mismatch'

      return [{
        date,
        kind,
        canonicalCount,
        replayedCount,
        delta: replayedCount - canonicalCount,
      }]
    })

  const canonicalCheckinDates = new Set(canonicalRewardedCheckinDates)
  const replayedCheckinDates = new Set(replayed.rewardedCheckinDates)
  const compatibilitySourcesByDate = new Map(
    compatibilityCheckinDates.map((hint) => [hint.date, hint.sources]),
  )
  const checkinDifferences = [...new Set([
    ...canonicalCheckinDates,
    ...replayedCheckinDates,
  ])]
    .sort((left, right) => right.localeCompare(left))
    .flatMap((date): ActivityConsistencyCheckinDifference[] => {
      const existsInCanonical = canonicalCheckinDates.has(date)
      const existsInReplay = replayedCheckinDates.has(date)
      if (existsInCanonical === existsInReplay) return []

      return [{
        date,
        kind: existsInCanonical ? 'missing-in-ledger' : 'extra-in-ledger',
        compatibilitySources: compatibilitySourcesByDate.get(date) ?? [],
      }]
    })
  const totalDifferenceCount = scalarDifferences.length
    + heatmapDifferences.length
    + checkinDifferences.length

  return {
    status: totalDifferenceCount === 0 ? 'consistent' : 'drift',
    checkedAt,
    today,
    ledger,
    scalarDifferences,
    heatmapDifferences,
    checkinDifferences,
    summary: {
      scalarFieldCount: scalarDifferences.length,
      heatmapDateCount: heatmapDifferences.length,
      checkinDateCount: checkinDifferences.length,
      totalDifferenceCount,
    },
    excludedFields: ACTIVITY_CONSISTENCY_EXCLUDED_FIELDS,
  }
}

function getCompatibilityCheckinDates(): ActivityConsistencyCheckinCompatibilityHint[] {
  const requirements = new Map<string, Set<ActivityConsistencyCheckinCompatibilitySource>>()
  const addRequirement = (date: string, source: ActivityConsistencyCheckinCompatibilitySource) => {
    const sources = requirements.get(date) ?? new Set<ActivityConsistencyCheckinCompatibilitySource>()
    sources.add(source)
    requirements.set(date, sources)
  }

  for (const execution of usePlanStore.getState().executions) {
    if (execution.isCompleted) addRequirement(execution.date, 'completed-execution')
  }

  const lastCheckinDate = useSettingsStore.getState().lastCheckinDate
  if (lastCheckinDate) addRequirement(lastCheckinDate, 'last-checkin')

  return [...requirements]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, sources]) => ({ date, sources: [...sources] }))
}

export function diagnoseCurrentActivityConsistency(
  options: DiagnoseActivityConsistencyOptions = {},
): ActivityConsistencyReport {
  const checkedAt = options.checkedAt ?? new Date().toISOString()
  const today = options.today ?? toLocalDate()
  const ledgerState = useActivityLedgerStore.getState()

  if (ledgerState.baseline === null) {
    return createUnavailableReport(checkedAt, today, 'ledger-not-initialized')
  }

  const ledger: ActivityConsistencyLedgerMeta = {
    schemaVersion: ledgerState.schemaVersion,
    capturedAt: ledgerState.baseline.capturedAt,
    source: ledgerState.baseline.source,
    eventCount: ledgerState.events.length,
  }

  try {
    const achievements = useAchievementStore.getState()
    const dailyCheckins = useDailyCheckinStore.getState()
    const streak = useStreakStore.getState()
    const snapshot = structuredClone({
      schemaVersion: ledgerState.schemaVersion,
      baseline: ledgerState.baseline,
      events: ledgerState.events,
    } satisfies ActivityLedgerSnapshot)
    const canonical: ActivityConsistencyProjection = {
      achievements: {
        totalXP: achievements.totalXP,
        level: achievements.level,
      },
      streak: {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastActiveDate: streak.lastActiveDate || '',
        heatmapData: { ...streak.heatmapData },
      },
      lastCheckinDate: useSettingsStore.getState().lastCheckinDate,
    }

    return buildActivityConsistencyReport({
      canonical,
      replayed: replayActivityLedger(snapshot, today),
      canonicalRewardedCheckinDates: dailyCheckins.awards.map((award) => award.date),
      compatibilityCheckinDates: getCompatibilityCheckinDates(),
      ledger,
      checkedAt,
      today,
    })
  } catch {
    return createUnavailableReport(checkedAt, today, 'replay-failed', ledger)
  }
}
