import { rebuildActivityLedger } from '@/data/activityLedgerBootstrap'
import {
  installCanonicalMutationPulseListener,
  readCanonicalMutationEpoch,
  withCanonicalMutationLock,
} from '@/data/canonicalMutationCoordinator'
import {
  readPendingLocalMutation,
  recoverPendingLocalMutation,
} from '@/data/localMutationJournal'
import { useAchievementStore } from '@/stores/achievementStore'
import { useActivityLedgerStore } from '@/stores/activityLedgerStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'

const TRACKER_CANONICAL_SCOPES = new Set([
  'studyPlans',
  'practiceRecords',
  'timerRecords',
  'wordRecords',
  'trackerCore',
])

export type TrackerCanonicalRefreshStatus = 'refreshed' | 'deferred' | 'reload-required'

let crossTabSyncInstalled = false
const observedCanonicalMutationEpoch = readCanonicalMutationEpoch()

async function rehydrateTrackerCanonicalStores(): Promise<void> {
  await Promise.all([
    Promise.resolve(usePlanStore.persist.rehydrate()),
    Promise.resolve(usePracticeStore.persist.rehydrate()),
    Promise.resolve(useTimerStore.persist.rehydrate()),
    Promise.resolve(useWordStore.persist.rehydrate()),
    Promise.resolve(useDailyCheckinStore.persist.rehydrate()),
    Promise.resolve(useAchievementStore.persist.rehydrate()),
    Promise.resolve(useStreakStore.persist.rehydrate()),
    Promise.resolve(useSettingsStore.persist.rehydrate()),
    Promise.resolve(useActivityLedgerStore.persist.rehydrate()),
  ])
}

export async function refreshTrackerCanonicalStores(): Promise<TrackerCanonicalRefreshStatus> {
  return withCanonicalMutationLock(async () => {
    if (readCanonicalMutationEpoch() !== observedCanonicalMutationEpoch) {
      return 'reload-required'
    }

    const pending = readPendingLocalMutation()
    // A prepared marker can belong to a legacy domain that has not joined the
    // shared lock yet. Never roll it back from a passive focus/storage refresh.
    if (pending?.phase === 'prepared') return 'deferred'

    const recovery = recoverPendingLocalMutation()
    if (recovery.status === 'conflict' || recovery.status === 'failed') {
      return 'deferred'
    }

    await rehydrateTrackerCanonicalStores()
    if (recovery.requiresLedgerRebuild) {
      rebuildActivityLedger(new Date().toISOString(), 'recovery')
    }
    return 'refreshed'
  })
}

export function installTrackerCanonicalCrossTabSync(): void {
  if (crossTabSyncInstalled || typeof window === 'undefined') return
  crossTabSyncInstalled = true

  const refreshOrReload = async () => {
    try {
      const status = await refreshTrackerCanonicalStores()
      if (status === 'reload-required') window.location.reload()
    } catch {
      // A later focus, storage pulse, explicit mutation or reload retries safely.
    }
  }

  installCanonicalMutationPulseListener(async (scope) => {
    if (scope === 'all') {
      window.location.reload()
      return
    }
    if (TRACKER_CANONICAL_SCOPES.has(scope)) await refreshOrReload()
  })
  window.addEventListener('focus', () => { void refreshOrReload() })
}
