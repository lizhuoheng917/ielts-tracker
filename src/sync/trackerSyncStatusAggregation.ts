import type {
  TrackerCloudSyncPhase,
  TrackerCloudSyncStatus,
} from '@/sync/trackerSyncStatusStore'

export type TrackerSyncStreamStatus = Pick<
  TrackerCloudSyncStatus,
  'phase' | 'detail' | 'lastSyncedAt'
> & Partial<Pick<TrackerCloudSyncStatus, 'conflict' | 'resolveConflict'>>

interface AggregateTrackerSyncStatusInput {
  accountUserId: string
  examDate: TrackerSyncStreamStatus
  learningRecords: TrackerSyncStreamStatus
}

const PHASE_PRIORITY: Record<TrackerCloudSyncPhase, number> = {
  idle: 0,
  synced: 10,
  paused: 20,
  checking: 30,
  syncing: 40,
  partial: 45,
  offline: 50,
  error: 60,
  needs_choice: 70,
}

function latestTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (!left) return right
  if (!right) return left
  return left > right ? left : right
}

export function aggregateTrackerSyncStatus({
  accountUserId,
  examDate,
  learningRecords,
}: AggregateTrackerSyncStatusInput): TrackerCloudSyncStatus {
  const selected = PHASE_PRIORITY[examDate.phase] >= PHASE_PRIORITY[learningRecords.phase]
    ? examDate
    : learningRecords
  const bothSynced = examDate.phase === 'synced' && learningRecords.phase === 'synced'
  const needsExamChoice = examDate.phase === 'needs_choice'

  return {
    accountUserId,
    phase: selected.phase,
    lastSyncedAt: latestTimestamp(examDate.lastSyncedAt, learningRecords.lastSyncedAt),
    detail: bothSynced
      ? '学习计划、练习记录和考试日期已同步'
      : selected.detail,
    // Only the exam-date stream has a user-resolvable baseline conflict. A
    // learning-record error must never inherit or expose this resolver.
    conflict: needsExamChoice ? examDate.conflict ?? null : null,
    resolveConflict: needsExamChoice ? examDate.resolveConflict ?? null : null,
  }
}
