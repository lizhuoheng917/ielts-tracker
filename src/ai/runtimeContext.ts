import { useAchievementStore } from '@/stores/achievementStore'
import { useAIPrivacyStore } from '@/stores/aiPrivacyStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { useStreakStore } from '@/stores/streakStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'
import type { StatsRangeDays } from '@/lib/statsAnalytics'
import type { AiPurpose } from './contracts'
import { buildLearningContextSnapshot } from './learningContext'
import { listAiArtifactsForAccess } from './artifactRepository'
import { getRuntimeAiArtifactAccess } from './artifactAccessRuntime'

export interface CreateCurrentLearningContextOptions {
  purpose: AiPurpose
  rangeDays?: StatsRangeDays
  now?: Date
}

/** Reads every source after the user starts the request, never at page mount. */
export function createCurrentLearningContext(options: CreateCurrentLearningContextOptions) {
  const words = useWordStore.getState()
  const practice = usePracticeStore.getState()
  const timer = useTimerStore.getState()
  const plans = usePlanStore.getState()
  const diary = useDiaryStore.getState()
  const streak = useStreakStore.getState()
  const achievement = useAchievementStore.getState()
  const privacy = useAIPrivacyStore.getState()
  const aiArtifacts = privacy.includePriorAIArtifacts
    ? listAiArtifactsForAccess(
        useAiArtifactStore.getState().artifacts,
        getRuntimeAiArtifactAccess(),
        'learning_analysis',
      )
    : []
  const level = achievement.getCurrentLevel()

  return buildLearningContextSnapshot({
    wordRecords: words.records,
    practiceRecords: practice.records,
    timerRecords: timer.records,
    plans: plans.plans,
    planExecutions: plans.executions,
    diaryEntries: diary.entries,
    aiArtifacts,
    streak: {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      heatmapData: streak.heatmapData,
    },
    achievement: {
      totalXP: achievement.totalXP,
      level: level.level,
      levelName: level.name,
    },
  }, {
    purpose: options.purpose,
    rangeDays: options.rangeDays ?? privacy.defaultRangeDays,
    privacy: {
      defaultRangeDays: privacy.defaultRangeDays,
      includeDiaryExcerpts: privacy.includeDiaryExcerpts,
      includePriorAIArtifacts: privacy.includePriorAIArtifacts,
    },
    now: options.now,
  })
}
