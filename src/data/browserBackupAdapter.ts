import { useAchievementStore } from '@/stores/achievementStore'
import { useAiArtifactStore } from '@/stores/aiArtifactStore'
import { useChatStore } from '@/stores/chatStore'
import { useDiaryStore } from '@/stores/diaryStore'
import { useDailyCheckinStore } from '@/stores/dailyCheckinStore'
import { usePlanStore } from '@/stores/planStore'
import { usePracticeStore } from '@/stores/practiceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useStreakStore } from '@/stores/streakStore'
import { useTimerStore } from '@/stores/timerStore'
import { useWordStore } from '@/stores/wordStore'
import { useWritingReportStore } from '@/stores/writingReportStore'
import type { BackupDataV3, BackupStateAdapter } from './backupTypes'
import { rebuildActivityLedger } from './activityLedgerBootstrap'
import { parseAiArtifactRecordV2 } from '@/ai/artifactRepository'
import { levelForXP } from '@/lib/learningXP'
import { deriveStreakData } from '@/lib/streakProjection'
import { toLocalDate } from '@/lib/localDate'
import { clearAllManagedAiDataBindings } from '@/auth/managedAiDataBinding'

function cloneData(data: BackupDataV3): BackupDataV3 {
  return JSON.parse(JSON.stringify(data)) as BackupDataV3
}

/**
 * Bridges portable user data to browser stores. AI runtime configuration is
 * deliberately outside this adapter, so both successful imports and rollback
 * writes preserve the configuration already trusted by this installation.
 */
export const browserBackupAdapter: BackupStateAdapter = {
  read: () => {
    const words = useWordStore.getState()
    const practice = usePracticeStore.getState()
    const timer = useTimerStore.getState()
    const plans = usePlanStore.getState()
    const diary = useDiaryStore.getState()
    const dailyCheckins = useDailyCheckinStore.getState()
    const aiArtifacts = useAiArtifactStore.getState()
    if (aiArtifacts.integrity.status !== 'ready') {
      throw new Error('AI 内容仓库需要恢复，完整备份已暂停以避免遗漏原始内容')
    }
    const writingReports = useWritingReportStore.getState()
    const chat = useChatStore.getState()
    const achievements = useAchievementStore.getState()
    const streak = useStreakStore.getState()
    const settings = useSettingsStore.getState()
    const totalXP = Number.isFinite(achievements.totalXP) ? Math.max(0, achievements.totalXP) : 0
    const streakProjection = deriveStreakData(streak.heatmapData, toLocalDate())

    return cloneData({
      words: words.records,
      practice: practice.records,
      timer: timer.records,
      plans: plans.plans,
      executions: plans.executions,
      planCommandReceipts: plans.aiCommandReceipts,
      diary: diary.entries,
      dailyCheckins: dailyCheckins.awards,
      writingReports: writingReports.reports,
      chatConversations: chat.conversations,
      aiArtifacts: aiArtifacts.artifacts,
      achievements: {
        unlockedBadges: achievements.unlockedBadges,
        totalXP,
        level: levelForXP(totalXP),
        statsViewCount: achievements.statsViewCount,
      },
      streak: {
        ...streakProjection,
        longestStreak: Math.max(streak.longestStreak, streakProjection.longestStreak),
      },
      settings: {
        examDate: settings.examDate,
        showExamCountdown: settings.showExamCountdown,
        showAiSuggestions: settings.showAiSuggestions,
        theme: settings.theme,
        lastCheckinDate: settings.lastCheckinDate,
      },
    })
  },
  write: (data) => {
    // The backup service snapshots all stores before this sequence and replays
    // that snapshot if a localStorage write fails partway through.
    const snapshot = cloneData(data)
    useWordStore.setState({ records: snapshot.words })
    usePracticeStore.setState({ records: snapshot.practice })
    useTimerStore.setState({ records: snapshot.timer })
    usePlanStore.setState({
      plans: snapshot.plans,
      executions: snapshot.executions,
      aiCommandReceipts: snapshot.planCommandReceipts ?? [],
    })
    useDiaryStore.setState({ entries: snapshot.diary })
    useDailyCheckinStore.setState({ migrationVersion: 1, awards: snapshot.dailyCheckins })
    useWritingReportStore.setState({ reports: snapshot.writingReports })
    useChatStore.setState({ conversations: snapshot.chatConversations })
    useAiArtifactStore.setState({
      artifacts: snapshot.aiArtifacts.map((artifact) => parseAiArtifactRecordV2(artifact)),
      migration: {
        version: 1,
        status: 'complete',
        importedCount: snapshot.aiArtifacts.length,
        completedAt: new Date().toISOString(),
      },
      integrity: { status: 'ready' },
    })
    const importedTotalXP = Number.isFinite(snapshot.achievements.totalXP)
      ? Math.max(0, snapshot.achievements.totalXP)
      : 0
    useAchievementStore.setState({
      ...snapshot.achievements,
      totalXP: importedTotalXP,
      level: levelForXP(importedTotalXP),
    })
    const importedStreak = deriveStreakData(snapshot.streak.heatmapData, toLocalDate())
    useStreakStore.setState({
      ...importedStreak,
      longestStreak: Math.max(snapshot.streak.longestStreak, importedStreak.longestStreak),
    })
    useSettingsStore.setState({
      examDate: snapshot.settings.examDate,
      showExamCountdown: snapshot.settings.showExamCountdown,
      showAiSuggestions: snapshot.settings.showAiSuggestions,
      theme: snapshot.settings.theme,
      lastCheckinDate: snapshot.settings.lastCheckinDate,
    })
    // The shadow ledger is a rebuildable diagnostic cache in v1. Rebase it on
    // the imported canonical records instead of replaying stale local events.
    rebuildActivityLedger(new Date().toISOString(), 'import')
  },
  afterSuccessfulImport: () => {
    // Imported records have unknown account provenance. A learner must confirm
    // their ownership again before any of them can cross the Managed AI boundary.
    clearAllManagedAiDataBindings()
  },
}
