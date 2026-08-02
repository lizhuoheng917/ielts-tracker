import type { ActivityTransactionPlan } from '@/data/activityTransaction'
import { appendActivityLedgerEventsOrThrow } from '@/data/activityLedgerRuntime'
import { runLocalMutation } from '@/data/localMutationJournal'
import { useAchievementStore } from '@/stores/achievementStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'

function requestSafeReload() {
  if (typeof window === 'undefined') return
  window.setTimeout(() => window.location.reload(), 0)
}

export function commitActivityTransaction(
  plan: ActivityTransactionPlan,
  applyDomainState: () => void,
): boolean {
  const result = runLocalMutation(
    plan.transaction,
    () => {
      applyDomainState()
      useAchievementStore.setState(plan.projectionAfter.achievements)
      useStreakStore.setState(plan.projectionAfter.streak)
      if (plan.projectionAfter.checkinChanged) {
        useSettingsStore.setState({ lastCheckinDate: plan.projectionAfter.lastCheckinDate })
      }
    },
    () => {
      appendActivityLedgerEventsOrThrow(plan.ledgerEvents)
    },
  )

  if (!result.ok || result.error) requestSafeReload()
  if (result.ok) {
    const achievements = useAchievementStore.getState()
    if (plan.projectionAfter.streak.longestStreak >= 7) achievements.unlockBadge('streak-7')
    if (plan.projectionAfter.streak.longestStreak >= 30) achievements.unlockBadge('streak-30')
    if (plan.projectionAfter.checkinChanged) achievements.unlockBadge('first-checkin')
  }
  return result.ok
}
