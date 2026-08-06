import { describe, expect, it, vi } from 'vitest'

import { aggregateTrackerSyncStatus } from '@/sync/trackerSyncStatusAggregation'

const synced = (at: string) => ({
  phase: 'synced' as const,
  detail: '已同步',
  lastSyncedAt: at,
})
describe('Tracker sync status aggregation', () => {
  it('does not let an exam-date success hide a learning-record failure', () => {
    const status = aggregateTrackerSyncStatus({
      accountUserId: 'account-1',
      examDate: synced('2026-08-03T01:00:00.000Z'),
      learningRecords: {
        phase: 'error',
        detail: '学习记录稍后会自动重试',
        lastSyncedAt: null,
      },
    })

    expect(status.phase).toBe('error')
    expect(status.detail).toContain('自动重试')
    expect(status.lastSyncedAt).toBe('2026-08-03T01:00:00.000Z')
  })

  it('reports a partial scope when learning records are paused but the exam date is synced', () => {
    const status = aggregateTrackerSyncStatus({
      accountUserId: 'account-1',
      examDate: synced('2026-08-03T01:00:00.000Z'),
      learningRecords: {
        phase: 'paused',
        detail: '学习记录同步暂未开放',
        lastSyncedAt: null,
      },
    })

    expect(status.phase).toBe('partial')
    expect(status.detail).toContain('考试日期已同步')
    expect(status.lastSyncedAt).toBe('2026-08-03T01:00:00.000Z')
  })

  it('reports a partial scope when the exam date is paused but learning records are synced', () => {
    const status = aggregateTrackerSyncStatus({
      accountUserId: 'account-1',
      examDate: {
        phase: 'paused',
        detail: '考试日期同步暂未开放',
        lastSyncedAt: null,
      },
      learningRecords: synced('2026-08-03T01:01:00.000Z'),
    })

    expect(status.phase).toBe('partial')
    expect(status.detail).toContain('学习记录已同步')
    expect(status.lastSyncedAt).toBe('2026-08-03T01:01:00.000Z')
  })

  it('keeps cloud sync paused when both streams are unavailable', () => {
    const status = aggregateTrackerSyncStatus({
      accountUserId: 'account-1',
      examDate: {
        phase: 'paused',
        detail: '考试日期同步暂未开放',
        lastSyncedAt: null,
      },
      learningRecords: {
        phase: 'paused',
        detail: '学习记录同步暂未开放',
        lastSyncedAt: null,
      },
    })

    expect(status.phase).toBe('paused')
    expect(status.detail).toContain('考试日期')
  })

  it('keeps the exam-date choice above background record activity', async () => {
    const resolveConflict = vi.fn(async () => undefined)
    const conflict = { localExamDate: '2026-12-01', remoteExamDate: '2027-01-01' }
    const status = aggregateTrackerSyncStatus({
      accountUserId: 'account-1',
      examDate: {
        phase: 'needs_choice',
        detail: '请选择考试日期',
        lastSyncedAt: null,
        conflict,
        resolveConflict,
      },
      learningRecords: {
        phase: 'syncing',
        detail: '正在同步学习记录',
        lastSyncedAt: null,
      },
    })

    expect(status.phase).toBe('needs_choice')
    expect(status.conflict).toEqual(conflict)
    await status.resolveConflict?.('remote')
    expect(resolveConflict).toHaveBeenCalledWith('remote')
  })

  it('clears the exam resolver unless the exam stream needs a choice', () => {
    const status = aggregateTrackerSyncStatus({
      accountUserId: 'account-1',
      examDate: {
        ...synced('2026-08-03T01:00:00.000Z'),
        conflict: { localExamDate: null, remoteExamDate: '2027-01-01' },
        resolveConflict: async () => undefined,
      },
      learningRecords: synced('2026-08-03T01:01:00.000Z'),
    })

    expect(status.phase).toBe('synced')
    expect(status.detail).toContain('学习计划')
    expect(status.lastSyncedAt).toBe('2026-08-03T01:01:00.000Z')
    expect(status.conflict).toBeNull()
    expect(status.resolveConflict).toBeNull()
  })
})
