import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TrackerShadowSyncRpcError } from '@/sync/trackerShadowSyncRpc'

const ACCOUNT_A = '10000000-0000-4000-8000-000000000001'
const ACCOUNT_B = '20000000-0000-4000-8000-000000000002'

let policy: typeof import('@/sync/trackerContentCloudPolicy')
let refreshModule: typeof import('@/sync/trackerContentCloudPolicyRefresh')

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

function resetPolicy(): void {
  policy.useTrackerContentCloudPolicyStore.setState({
    activeScope: policy.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE,
    deviceScopeClaimed: false,
    selectiveCloudAvailableByScope: {},
    quotaByScope: {},
    contentCloudStatusByScope: {},
    contentCloudRefreshByScope: {},
    scopes: {
      [policy.TRACKER_CONTENT_CLOUD_DEVICE_SCOPE]: {
        initialized: true,
        revision: 0,
        modes: {},
        restoreRequests: {},
        failures: {},
      },
    },
  })
}

function activateAccount(accountUserId = ACCOUNT_A): void {
  policy.useTrackerContentCloudPolicyStore.getState().activateScope(accountUserId, { adoptDeviceScope: true })
}

function capabilities(input: { enabled?: boolean; remaining?: number } = {}) {
  const remaining = input.remaining ?? 3
  return {
    product: 'tracker',
    schemaVersion: 1,
    protocolVersion: 1,
    enabled: true,
    accountEpoch: 1,
    currentCursor: 6,
    allowedEntityKinds: ['study_plan', 'plan_execution', 'practice_record', 'timer_record', 'word_record'],
    maxBatchSize: 50,
    maxPayloadBytes: 64 * 1024,
    selectiveContentCloudV1: true,
    selectiveContentCloudEnabled: input.enabled ?? true,
    contentQuota: {
      word_record: { limit: 3, used: 3 - remaining, remaining },
    },
  }
}

function status(input: {
  changed: boolean
  enabled?: boolean
  remaining?: number
  policyVersion?: number
  overrideVersion?: number
  contentCursor?: number
}) {
  const changed = input.changed
  const remaining = input.remaining ?? 3
  return {
    changed,
    selectiveContentCloudEnabled: input.enabled ?? true,
    policyVersion: input.policyVersion ?? 1,
    overrideVersion: input.overrideVersion ?? 0,
    contentCursor: input.contentCursor ?? 6,
    contentQuota: changed
      ? { word_record: { limit: 3, used: 3 - remaining, remaining } }
      : null,
  }
}

describe('Tracker content-cloud policy refresh runtime', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new MemoryStorage())
    policy = await import('@/sync/trackerContentCloudPolicy')
    refreshModule = await import('@/sync/trackerContentCloudPolicyRefresh')
    resetPolicy()
    activateAccount()
  })

  it('uses the lightweight status response to immediately replace the switch and allowance', async () => {
    const getContentCloudStatus = vi.fn(async () => status({ changed: true, enabled: true, remaining: 1 }))
    const getCapabilities = vi.fn(async () => capabilities({ remaining: 2 }))
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token' }),
        getContentCloudStatus,
        getCapabilities,
      },
    })

    await expect(runtime.refresh({ force: true, reason: 'manual' })).resolves.toMatchObject({
      status: 'applied', source: 'status',
    })
    expect(getContentCloudStatus).toHaveBeenCalledWith('token', {
      expectedUserId: ACCOUNT_A,
      knownPolicyVersion: null,
      knownOverrideVersion: null,
      knownContentCursor: null,
    })
    expect(getCapabilities).not.toHaveBeenCalled()
    const state = policy.useTrackerContentCloudPolicyStore.getState()
    expect(state.selectiveCloudAvailableByScope[ACCOUNT_A]).toBe(true)
    expect(state.quotaByScope[ACCOUNT_A]?.word_record?.remaining).toBe(1)
    expect(policy.trackerContentCloudPolicyStatus(ACCOUNT_A)).toMatchObject({
      policyVersion: 1, overrideVersion: 0, contentCursor: 6,
    })
    expect(policy.trackerContentCloudPolicyRefreshState(ACCOUNT_A)).toMatchObject({
      phase: 'ready', lastErrorAt: null,
    })
    expect(policy.trackerContentCloudPolicyRefreshState(ACCOUNT_A).lastCheckedAt).not.toBeNull()
  })

  it('keeps the last confirmed switch and quota when the new status says unchanged', async () => {
    const getContentCloudStatus = vi.fn()
      .mockResolvedValueOnce(status({ changed: true, enabled: true, remaining: 1, contentCursor: 6 }))
      .mockResolvedValueOnce(status({ changed: false, enabled: true, policyVersion: 1, contentCursor: 6 }))
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token' }),
        getContentCloudStatus,
        getCapabilities: async () => capabilities(),
      },
    })

    await runtime.refresh({ force: true })
    await expect(runtime.refresh({ force: true })).resolves.toEqual({ status: 'unchanged' })
    expect(policy.useTrackerContentCloudPolicyStore.getState().quotaByScope[ACCOUNT_A]?.word_record?.remaining).toBe(1)
    expect(getContentCloudStatus).toHaveBeenLastCalledWith('token', {
      expectedUserId: ACCOUNT_A,
      knownPolicyVersion: 1,
      knownOverrideVersion: 0,
      knownContentCursor: 6,
    })
  })

  it('falls back to existing capabilities during a rolling deployment without the status RPC', async () => {
    const getCapabilities = vi.fn(async () => capabilities({ enabled: false, remaining: 0 }))
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token' }),
        getContentCloudStatus: async () => {
          throw new TrackerShadowSyncRpcError({ httpStatus: 404, rpcCode: 'PGRST202' })
        },
        getCapabilities,
      },
    })

    await expect(runtime.refresh({ force: true })).resolves.toMatchObject({
      status: 'applied', source: 'capabilities',
    })
    expect(getCapabilities).toHaveBeenCalledTimes(1)
    const state = policy.useTrackerContentCloudPolicyStore.getState()
    expect(state.selectiveCloudAvailableByScope[ACCOUNT_A]).toBe(false)
    expect(state.quotaByScope[ACCOUNT_A]?.word_record?.remaining).toBe(0)
    expect(policy.trackerContentCloudPolicyStatus(ACCOUNT_A).contentCursor).toBe(6)
  })

  it('preserves the last confirmed switch and allowance when a refresh fails', async () => {
    policy.applyTrackerContentCloudCapabilities({
      accountUserId: ACCOUNT_A,
      selectiveCloudAvailable: true,
      quota: { word_record: { limit: 3, used: 2, remaining: 1 } },
      status: { policyVersion: 1, overrideVersion: 0, contentCursor: 6 },
    })
    const getCapabilities = vi.fn(async () => capabilities({ enabled: false, remaining: 0 }))
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token' }),
        getContentCloudStatus: async () => { throw new Error('network unavailable') },
        getCapabilities,
      },
    })

    await expect(runtime.refresh({ force: true })).resolves.toEqual({ status: 'failed' })
    expect(getCapabilities).not.toHaveBeenCalled()
    const state = policy.useTrackerContentCloudPolicyStore.getState()
    expect(state.selectiveCloudAvailableByScope[ACCOUNT_A]).toBe(true)
    expect(state.quotaByScope[ACCOUNT_A]?.word_record?.remaining).toBe(1)
    expect(policy.trackerContentCloudPolicyRefreshState(ACCOUNT_A)).toMatchObject({ phase: 'error' })
  })

  it('shares concurrent refreshes and throttles passive focus-like refreshes for sixty seconds', async () => {
    let now = 0
    let release!: (value: ReturnType<typeof status>) => void
    const pending = new Promise<ReturnType<typeof status>>((resolve) => { release = resolve })
    const getContentCloudStatus = vi.fn(() => pending)
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      now: () => now,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token' }),
        getContentCloudStatus,
        getCapabilities: async () => capabilities(),
      },
    })

    const first = runtime.refresh({ force: true })
    const second = runtime.refresh({ force: true })
    expect(policy.trackerContentCloudPolicyRefreshState(ACCOUNT_A)).toMatchObject({ phase: 'refreshing' })
    release(status({ changed: true, remaining: 2 }))
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'applied' }),
      expect.objectContaining({ status: 'applied' }),
    ])
    expect(getContentCloudStatus).toHaveBeenCalledTimes(1)

    now = 59_999
    await expect(runtime.refresh({ reason: 'focus' })).resolves.toEqual({ status: 'skipped', reason: 'throttled' })
    expect(getContentCloudStatus).toHaveBeenCalledTimes(1)
    now = 60_000
    await runtime.refresh({ reason: 'focus' })
    expect(getContentCloudStatus).toHaveBeenCalledTimes(2)
  })

  it('runs one post-save probe when a save finishes during its pre-save probe', async () => {
    let release!: (value: ReturnType<typeof status>) => void
    const pending = new Promise<ReturnType<typeof status>>((resolve) => { release = resolve })
    const getContentCloudStatus = vi.fn()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(status({ changed: true, remaining: 0, contentCursor: 7 }))
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token' }),
        getContentCloudStatus,
        getCapabilities: async () => capabilities(),
      },
    })

    const preSave = runtime.refresh({ force: true, reason: 'before-save' })
    const afterSave = runtime.refresh({ force: true, reason: 'after-save' })
    expect(afterSave).toBe(preSave)
    release(status({ changed: true, remaining: 1, contentCursor: 6 }))
    await preSave
    await vi.waitFor(() => expect(getContentCloudStatus).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(
      policy.useTrackerContentCloudPolicyStore.getState().quotaByScope[ACCOUNT_A]?.word_record?.remaining,
    ).toBe(0))
  })

  it('discards a late account-A response after the active scope changes to account B', async () => {
    let release!: (value: ReturnType<typeof status>) => void
    const pending = new Promise<ReturnType<typeof status>>((resolve) => { release = resolve })
    const runtime = new refreshModule.TrackerContentCloudPolicyRefreshRuntime({
      accountUserId: ACCOUNT_A,
      rpc: {
        getVerifiedIdentity: async () => ({ accountUserId: ACCOUNT_A, accessToken: 'token-a' }),
        getContentCloudStatus: async () => pending,
        getCapabilities: async () => capabilities(),
      },
    })

    const result = runtime.refresh({ force: true })
    policy.useTrackerContentCloudPolicyStore.getState().activateScope(ACCOUNT_B, { adoptDeviceScope: true })
    release(status({ changed: true, enabled: true, remaining: 3 }))

    await expect(result).resolves.toEqual({ status: 'skipped', reason: 'scope_changed' })
    expect(policy.useTrackerContentCloudPolicyStore.getState().quotaByScope[ACCOUNT_B]).toBeUndefined()
  })
})
