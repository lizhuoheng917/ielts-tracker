import type {
  AchievementState,
  DailyCheckinAward,
  DiaryEntry,
  PlanExecution,
  PracticeRecord,
  Settings,
  StreakData,
  StudyPlan,
  TimerRecord,
  WordRecord,
} from '@/lib/types'
import type { AiArtifactRecordV2 } from '@/ai/artifactRepository'
import type { AiCommandReceipt } from '@/ai/contracts'
import type { ChatMessageRecord } from '@/stores/chatStore'
import type { WritingReport } from '@/stores/writingReportStore'

export const BACKUP_FORMAT = 'ielts-tracker-backup' as const
export const BACKUP_VERSION = 3 as const

export interface BackupSettings extends Settings {
  showExamCountdown: boolean
  showAiSuggestions: boolean
  showWordsDailySummary: boolean
}

/**
 * Public, portable user data. Runtime AI credentials and provider routing
 * (providerPreset, apiKey, baseURL and model) are intentionally outside this contract.
 */
export interface BackupDataV3 {
  words: WordRecord[]
  practice: PracticeRecord[]
  timer: TimerRecord[]
  plans: StudyPlan[]
  executions: PlanExecution[]
  /** Durable plan-command receipts share the same local store as plans. */
  planCommandReceipts?: AiCommandReceipt[]
  diary: DiaryEntry[]
  dailyCheckins: DailyCheckinAward[]
  writingReports: WritingReport[]
  chatConversations: Record<string, ChatMessageRecord[]>
  aiArtifacts: AiArtifactRecordV2[]
  achievements: AchievementState
  streak: StreakData
  settings: BackupSettings
}

export interface BackupV3 {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  data: BackupDataV3
}

export interface BackupImportResult {
  sourceVersion: 1 | 2 | 3
  backup: BackupV3
}

export interface BackupStateAdapter {
  read: () => BackupDataV3
  write: (data: BackupDataV3) => void
  /** Runs inside the import transaction after the replacement write succeeds. */
  afterSuccessfulImport?: () => void
}

/** @deprecated The public backup contract is V3; retained for source compatibility. */
export type BackupDataV2 = BackupDataV3

/** @deprecated The public backup contract is V3; retained for source compatibility. */
export type BackupV2 = BackupV3
