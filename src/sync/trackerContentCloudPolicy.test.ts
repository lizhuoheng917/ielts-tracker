import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StudyPlan, WordRecord } from '@/lib/types'
import type { TrackerPhase4bLocalSnapshot } from '@/sync/trackerPhase4bRecordSync'
const ACCOUNT_A = '10000000-0000-4000-8000-000000000001'
const ACCOUNT_B = '20000000-0000-4000-8000-000000000002'
const t0 = '2026-08-04T00:00:00.000Z'

let policy: typeof import('@/sync/trackerContentCloudPolicy')

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

function plan(id = 'plan-1'): StudyPlan {
  return {
    id,
    title: '阅读计划',
    category: 'reading',
    frequency: 'daily',
    isActive: true,
    createdAt: t0,
    updatedAt: t0,
  }
}

function word(id = 'word-1'): WordRecord {
  return {
    id,
    date: '2026-08-04',
    category: '学术词汇',
    subCategory: '教育',
    count: 12,
    note: '本机记录',
    createdAt: t0,
    updatedAt: t0,
  }
}

function snapshot(input: Partial<TrackerPhase4bLocalSnapshot> = {}): TrackerPhase4bLocalSnapshot {
  return {
    studyPlans: [],
    planExecutions: [],
    practiceRecords: [],
    timerRecords: [],
    wordRecords: [],
    ...input,
  }
}

function resetPolicy(): void {
  policy.useTrackerContentCloudPolicyStore.setState({
    activeScope: policy.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE,
    deviceScopeClaimed: false,
    selectiveCloudAvailableByScope: {},
    scopes: {
      [policy.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]: {
        initialized: false,
        revision: 0,
        modes: {},
        restoreRequests: {},
        failures: {},
      },
    },
    quotaByScope: {},
  })
}

describe('Tracker content cloud location policy', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new MemoryStorage())
    policy = await import('@/sync/trackerContentCloudPolicy')
    resetPolicy()
  })

  it('keeps new records local by default once the existing content has been adopted', () => {
    const store = policy.useTrackerContentCloudPolicyStore.getState()
    store.ensureLegacyContent([])

    const local = snapshot({ wordRecords: [word()] })

    expect(policy.projectTrackerContentCloudSnapshot(local)).toEqual(snapshot())
  })

  it('projects an explicit local-to-cloud choice and retains a local-only row across a cloud pull', () => {
    const store = policy.useTrackerContentCloudPolicyStore.getState()
    store.ensureLegacyContent([])
    const local = snapshot({ wordRecords: [word()] })

    store.setMode('word_record', 'word-1', 'cloud', { now: t0 })
    expect(policy.projectTrackerContentCloudSnapshot(local).wordRecords).toEqual([word()])

    store.setMode('word_record', 'word-1', 'local', { now: t0 })
    const merged = policy.mergeTrackerContentCloudSnapshot(snapshot(), local)
    expect(merged.wordRecords).toEqual([word()])
  })

  it('uses pending transfer state only for paired plan operations', () => {
    const store = policy.useTrackerContentCloudPolicyStore.getState()
    store.ensureLegacyContent([])

    policy.setTrackerContentCloudLocation({ entityKind: 'word_record', entityId: 'word-1', mode: 'cloud' })
    expect(policy.trackerContentCloudTransferState('word_record', 'word-1')).toBeNull()
    store.completeContentTransfer('word_record', 'word-1', 'cloud')
    expect(policy.trackerContentCloudTransferState('word_record', 'word-1')).toBeNull()

    // An upload rejected before it creates a cloud row can safely be changed
    // back to local without waiting for an impossible remote delete receipt.
    store.markRejected('word_record', 'word-1', 'cloud_quota_reached')
    policy.setTrackerContentCloudLocation({ entityKind: 'word_record', entityId: 'word-1', mode: 'local' })
    expect(policy.trackerContentCloudTransferState('word_record', 'word-1')).toBeNull()
    expect(policy.trackerContentCloudFailure('word_record', 'word-1')).toBeNull()

    store.setMode('study_plan', 'plan-1', 'cloud', { now: t0, planTransfer: 'uploading' })
    // Cancelling an unfinished upload reverses the paired direction; it must
    // not leave the old upload direction attached to the local choice.
    policy.setTrackerContentCloudLocation({ entityKind: 'study_plan', entityId: 'plan-1', mode: 'local' })
    expect(policy.trackerContentCloudPlanTransferState('plan-1')).toBe('removing')
  })

  it('asks the bridge to refresh policy before an explicit cloud-location save', () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    try {
      const events: Array<{ type: string; detail: unknown }> = []
      target.addEventListener(policy.TRACKER_CONTENT_CLOUD_POLICY_REFRESH_EVENT, (event) => {
        events.push({ type: 'refresh', detail: (event as CustomEvent<unknown>).detail })
      })
      target.addEventListener(policy.TRACKER_CONTENT_CLOUD_SYNC_EVENT, (event) => {
        events.push({ type: 'sync', detail: (event as CustomEvent<unknown>).detail })
      })

      policy.setTrackerContentCloudLocation({ entityKind: 'word_record', entityId: 'word-1', mode: 'cloud' })

      expect(events).toEqual([
        { type: 'refresh', detail: { force: true, reason: 'before-save' } },
        expect.objectContaining({ type: 'sync' }),
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps plan executions together and does not expose a partial plan during upload', () => {
    const store = policy.useTrackerContentCloudPolicyStore.getState()
    store.ensureLegacyContent([])
    const local = snapshot({
      studyPlans: [plan()],
      planExecutions: [{
        id: 'execution-1',
        planId: 'plan-1',
        date: '2026-08-04',
        isCompleted: false,
        updatedAt: t0,
      }],
    })

    store.setMode('study_plan', 'plan-1', 'cloud', { now: t0, planTransfer: 'uploading' })
    expect(policy.projectTrackerContentCloudSnapshot(local)).toEqual(snapshot())
    // A background pull may be empty while the paired upload is in flight;
    // it must not erase the local parent or its executions.
    expect(policy.mergeTrackerContentCloudSnapshot(snapshot(), local)).toEqual(local)

    store.setMode('study_plan', 'plan-1', 'local', { now: t0, planTransfer: 'removing' })
    expect(policy.projectTrackerContentCloudSnapshot(local)).toEqual(local)
    // While removal is pending, a delayed cloud response cannot erase the
    // local plan that the learner just chose to keep on this device.
    expect(policy.mergeTrackerContentCloudSnapshot(snapshot(), local)).toEqual(local)
  })

  it('does not let account A cloud choices leak into account B on the same browser', () => {
    const store = policy.useTrackerContentCloudPolicyStore.getState()
    store.activateScope(ACCOUNT_A, { adoptDeviceScope: true })
    store.ensureLegacyContent([])
    store.setMode('word_record', 'shared-id', 'cloud', { now: t0 })

    store.activateScope(policy.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE)
    // This is the real logout edge: the bridge will inspect the full local
    // snapshot again, but device scope is already claimed by A and must stay
    // empty rather than becoming a second import source for B.
    store.ensureLegacyContent([{ entityKind: 'word_record', entityId: 'shared-id' }])
    store.activateScope(ACCOUNT_B, { adoptDeviceScope: true })
    // The next authenticated bridge run also sees A's browser rows. B starts
    // initialized/local, so this must not reinterpret them as B's legacy
    // cloud content.
    store.ensureLegacyContent([{ entityKind: 'word_record', entityId: 'shared-id' }])

    expect(policy.trackerContentCloudMode({ entityKind: 'word_record', entityId: 'shared-id' })).toBe('local')
    expect(policy.projectTrackerContentCloudSnapshot(snapshot({ wordRecords: [word('shared-id')] }))).toEqual(snapshot())

    store.activateScope(ACCOUNT_A)
    expect(policy.trackerContentCloudMode({ entityKind: 'word_record', entityId: 'shared-id' })).toBe('cloud')
  })

  it('turns a quota rejection into a clear local-first explanation', () => {
    expect(policy.readableTrackerContentCloudFailure('cloud_quota_reached')).toContain('本机内容仍已保留')
    expect(policy.readableTrackerContentCloudFailure('cloud_transfer_failed')).toContain('网络恢复后')
  })

  it('lets a plan editor expose its execution quota and retry the exact rejected execution', () => {
    const store = policy.useTrackerContentCloudPolicyStore.getState()
    store.setQuota({
      study_plan: { limit: 3, used: 1, remaining: 2 },
      plan_execution: { limit: 4, used: 3, remaining: 1 },
    })
    const quota = policy.useTrackerContentCloudPolicyStore.getState().quotaByScope[
      policy.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE
    ]

    expect(policy.trackerContentCloudQuotaHasCapacity(quota?.study_plan)).toBe(true)
    expect(policy.trackerContentCloudQuotaHasCapacity(quota?.plan_execution, 2)).toBe(false)

    store.markRejected('plan_execution', 'execution-1', 'cloud_quota_reached')
    // The plan field receives its execution ids and uses this lookup to show
    // the child error at the parent level without losing the precise retry id.
    expect(policy.trackerContentCloudFirstFailureId('plan_execution', ['execution-1'])).toBe('execution-1')
    expect(policy.trackerContentCloudFailure('plan_execution', 'execution-1')?.reason).toBe('cloud_quota_reached')
  })

  it('keeps policy metadata non-blocking when a non-browser caller has only a partial storage shim', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: () => null })
    const isolatedPolicy = await import('@/sync/trackerContentCloudPolicy')

    expect(() => isolatedPolicy.useTrackerContentCloudPolicyStore.getState().markRemoteContent([
      { entityKind: 'word_record', entityId: 'word-1' },
    ])).not.toThrow()
    expect(isolatedPolicy.trackerContentCloudMode({ entityKind: 'word_record', entityId: 'word-1' })).toBe('cloud')
  })
})
