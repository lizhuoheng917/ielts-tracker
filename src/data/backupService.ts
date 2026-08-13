import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupDataV3,
  type BackupImportResult,
  type BackupStateAdapter,
  type BackupV3,
} from './backupTypes'
import { makePortableAiArtifacts } from '@/ai/artifactRepository'
import type { ChatMessageRecord } from '@/stores/chatStore'
import { parseBackupJson } from './backupValidation'

export class BackupApplyError extends Error {
  readonly cause: unknown
  readonly rollbackCause?: unknown

  constructor(cause: unknown, rollbackCause?: unknown) {
    super(
      rollbackCause === undefined
        ? '导入应用失败，已恢复导入前的数据'
        : '导入应用失败，且自动回滚也失败了'
    )
    this.name = 'BackupApplyError'
    this.cause = cause
    this.rollbackCause = rollbackCause
  }
}

function cloneData(data: BackupDataV3): BackupDataV3 {
  return JSON.parse(JSON.stringify(data)) as BackupDataV3
}

function makePortableChatConversations(
  conversations: Record<string, ChatMessageRecord[]>,
): Record<string, ChatMessageRecord[]> {
  const portable: Record<string, ChatMessageRecord[]> = {}
  let managedContextIndex = 0
  Object.entries(conversations).forEach(([context, messages]) => {
    const portableContext = context.includes(':managed:')
      ? `${context.slice(0, context.indexOf(':managed:'))}:managed:unbound:${managedContextIndex++}`
      : context
    portable[portableContext] = messages.map((message) => ({
      ...message,
      ...(message.commandDrafts
        ? {
            commandDrafts: message.commandDrafts.map((draft) => ({
              ...draft,
              context: {
                ...draft.context,
                accountScopeId: draft.context.routeMode === 'managed'
                  ? 'managed:unbound'
                  : 'custom:device',
              },
            })),
          }
        : {}),
    }))
  })
  return portable
}

function createPublicBackupData(data: BackupDataV3): BackupDataV3 {
  return cloneData({
    words: data.words,
    practice: data.practice,
    timer: data.timer,
    plans: data.plans,
    executions: data.executions,
    planCommandReceipts: data.planCommandReceipts ?? [],
    diary: data.diary,
    dailyCheckins: data.dailyCheckins,
    writingReports: data.writingReports,
    chatConversations: makePortableChatConversations(data.chatConversations),
    // A portable archive never carries an account id. Ownership is explicitly
    // re-established by the learner after import.
    aiArtifacts: makePortableAiArtifacts(data.aiArtifacts),
    achievements: {
      unlockedBadges: data.achievements.unlockedBadges,
      totalXP: data.achievements.totalXP,
      level: data.achievements.level,
      statsViewCount: data.achievements.statsViewCount,
    },
    streak: {
      currentStreak: data.streak.currentStreak,
      longestStreak: data.streak.longestStreak,
      lastActiveDate: data.streak.lastActiveDate,
      heatmapData: data.streak.heatmapData,
    },
    settings: {
      examDate: data.settings.examDate,
      showExamCountdown: data.settings.showExamCountdown,
      showAiSuggestions: data.settings.showAiSuggestions,
      showWordsDailySummary: data.settings.showWordsDailySummary,
      dashboardCardOrder: data.settings.dashboardCardOrder,
      dashboardCardVisibility: data.settings.dashboardCardVisibility,
      theme: data.settings.theme,
      lastCheckinDate: data.settings.lastCheckinDate,
    },
  })
}

export function createBackupV3(
  adapter: BackupStateAdapter,
  exportedAt = new Date().toISOString()
): BackupV3 {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: createPublicBackupData(adapter.read()),
  }
}

export function serializeBackupV3(adapter: BackupStateAdapter): string {
  return JSON.stringify(createBackupV3(adapter), null, 2)
}

/** @deprecated Use createBackupV3. This alias now emits the V3 contract. */
export const createBackupV2 = createBackupV3

/** @deprecated Use serializeBackupV3. This alias now emits the V3 contract. */
export const serializeBackupV2 = serializeBackupV3

/**
 * Validates the complete document before the first write. If applying the
 * validated snapshot fails, the pre-import snapshot is written back.
 */
export function importBackupJson(
  json: string,
  adapter: BackupStateAdapter
): BackupImportResult {
  const before = cloneData(adapter.read())
  const result = parseBackupJson(json, before)

  try {
    adapter.write(cloneData(result.backup.data))
    adapter.afterSuccessfulImport?.()
  } catch (cause) {
    try {
      adapter.write(before)
    } catch (rollbackCause) {
      throw new BackupApplyError(cause, rollbackCause)
    }
    throw new BackupApplyError(cause)
  }

  return result
}
