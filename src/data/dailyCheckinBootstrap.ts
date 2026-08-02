import type { DailyCheckinAward } from '@/lib/types'
import { STORAGE_PREFIX } from '@/lib/constants'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { usePlanStore } from '@/stores/planStore'
import { useSettingsStore } from '@/stores/settingsStore'

export const DAILY_CHECKIN_MIGRATION_VERSION = 1
const DAILY_CHECKIN_STORAGE_KEY = `${STORAGE_PREFIX}:dailyCheckins`

export function ensureDailyCheckinAwardsInitialized(
  capturedAt = new Date().toISOString(),
): boolean {
  const store = useDailyCheckinStore.getState()
  if (store.migrationVersion >= DAILY_CHECKIN_MIGRATION_VERSION) return false

  const awardsByDate = new Map(store.awards.map((award) => [award.date, award]))
  for (const execution of usePlanStore.getState().executions) {
    if (!execution.isCompleted || awardsByDate.has(execution.date)) continue
    awardsByDate.set(execution.date, {
      id: execution.date,
      date: execution.date,
      awardedXP: 0,
      awardedAt: capturedAt,
      source: 'migration',
      sourceEntityId: execution.id,
    })
  }

  const lastCheckinDate = useSettingsStore.getState().lastCheckinDate
  if (lastCheckinDate && !awardsByDate.has(lastCheckinDate)) {
    awardsByDate.set(lastCheckinDate, {
      id: lastCheckinDate,
      date: lastCheckinDate,
      awardedXP: 0,
      awardedAt: capturedAt,
      source: 'migration',
    })
  }

  const awards: DailyCheckinAward[] = [...awardsByDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
  useDailyCheckinStore.setState({
    migrationVersion: DAILY_CHECKIN_MIGRATION_VERSION,
    awards,
  })

  const persisted = localStorage.getItem(DAILY_CHECKIN_STORAGE_KEY)
  if (persisted === null) throw new Error('每日打卡防重复数据未持久化。')
  const envelope = JSON.parse(persisted) as {
    state?: { migrationVersion?: unknown; awards?: unknown }
  }
  if (
    envelope.state?.migrationVersion !== DAILY_CHECKIN_MIGRATION_VERSION
    || JSON.stringify(envelope.state.awards) !== JSON.stringify(awards)
  ) {
    throw new Error('每日打卡防重复数据持久化校验失败。')
  }
  return true
}
