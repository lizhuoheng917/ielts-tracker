import {
  applyTrackerContentCloudCapabilities,
  applyTrackerContentCloudPolicyStatus,
  applyTrackerContentCloudPolicyRefreshState,
  trackerContentCloudPolicyStatus,
  type TrackerContentCloudPolicyRefreshRequest,
  type TrackerContentCloudPolicyStatus,
} from '@/sync/trackerContentCloudPolicy'
import {
  parseTrackerSyncCapabilities,
  type TrackerSyncCapabilities,
} from '@/sync/trackerShadowSyncProtocol'
import {
  browserTrackerShadowSyncRpc,
  type TrackerShadowSyncRpc,
} from '@/sync/trackerShadowSyncRpc'
import { useTrackerContentCloudPolicyStore } from '@/sync/trackerContentCloudPolicy'

/** Focus/visibility events can arrive together; keep ordinary refreshes cheap. */
export const TRACKER_CONTENT_CLOUD_POLICY_REFRESH_MIN_INTERVAL_MS = 60_000

export type TrackerContentCloudPolicyRefreshResult =
  | { status: 'applied'; source: 'status' | 'capabilities'; capabilities: TrackerSyncCapabilities }
  | { status: 'unchanged' }
  | { status: 'skipped'; reason: 'disposed' | 'throttled' | 'session_changed' | 'scope_changed' }
  | { status: 'failed' }

export interface TrackerContentCloudPolicyRefreshRuntimeOptions {
  /** The bound account that owns this bridge instance. */
  accountUserId: string
  rpc?: Pick<TrackerShadowSyncRpc, 'getVerifiedIdentity' | 'getCapabilities' | 'getContentCloudStatus'>
  minIntervalMs?: number
  now?: () => number
}

/**
 * Refreshes only the small policy/capacity response, rather than replaying a
 * learner's records. It deliberately has no retry loop: Supabase's client
 * already retries transient RPC failures, while a failed refresh must leave
 * the last known UI state intact and wait for the next normal user event.
 */
export class TrackerContentCloudPolicyRefreshRuntime {
  private readonly options: TrackerContentCloudPolicyRefreshRuntimeOptions
  private readonly rpc: Pick<TrackerShadowSyncRpc, 'getVerifiedIdentity' | 'getCapabilities' | 'getContentCloudStatus'>
  private readonly minIntervalMs: number
  private active: Promise<TrackerContentCloudPolicyRefreshResult> | null = null
  private lastSuccessfulRefreshAt: number | null = null
  /** A save can complete while its pre-save policy probe is still in flight. */
  private queuedAfterSaveRefresh = false
  private disposed = false

  constructor(options: TrackerContentCloudPolicyRefreshRuntimeOptions) {
    this.options = options
    this.rpc = options.rpc ?? browserTrackerShadowSyncRpc
    this.minIntervalMs = Math.max(0, options.minIntervalMs ?? TRACKER_CONTENT_CLOUD_POLICY_REFRESH_MIN_INTERVAL_MS)
  }

  dispose(): void {
    this.disposed = true
    this.queuedAfterSaveRefresh = false
  }

  refresh(
    request: TrackerContentCloudPolicyRefreshRequest = {},
  ): Promise<TrackerContentCloudPolicyRefreshResult> {
    if (this.disposed) return Promise.resolve({ status: 'skipped', reason: 'disposed' })
    if (!this.isActiveScope()) return Promise.resolve({ status: 'skipped', reason: 'scope_changed' })
    if (this.active) {
      // Do not let the response that began before an upload become the final
      // visible allowance after that upload changed the server cursor.
      if (request.reason === 'after-save') this.queuedAfterSaveRefresh = true
      return this.active
    }
    const now = this.now()
    if (
      !request.force
      && this.lastSuccessfulRefreshAt !== null
      && now - this.lastSuccessfulRefreshAt < this.minIntervalMs
    ) return Promise.resolve({ status: 'skipped', reason: 'throttled' })

    this.setRefreshState({ phase: 'refreshing' })
    const active = this.refreshOnce().finally(() => {
      if (this.active !== active) return
      this.active = null
      if (!this.queuedAfterSaveRefresh || this.disposed || !this.isActiveScope()) return
      this.queuedAfterSaveRefresh = false
      void this.refresh({ force: true, reason: 'after-save' })
    })
    this.active = active
    return active
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private isActiveScope(): boolean {
    return !this.disposed
      && useTrackerContentCloudPolicyStore.getState().activeScope === this.options.accountUserId
  }

  private setRefreshState(input: Parameters<typeof applyTrackerContentCloudPolicyRefreshState>[0]['state']): void {
    applyTrackerContentCloudPolicyRefreshState({
      accountUserId: this.options.accountUserId,
      state: input,
    })
  }

  private recordSuccessfulRefresh(): void {
    const checkedAt = new Date(this.now()).toISOString()
    this.lastSuccessfulRefreshAt = this.now()
    this.setRefreshState({ phase: 'ready', lastCheckedAt: checkedAt, lastErrorAt: null })
  }

  private recordRefreshFailure(): void {
    if (!this.isActiveScope()) return
    this.setRefreshState({ phase: 'error', lastErrorAt: new Date(this.now()).toISOString() })
  }

  private async refreshOnce(): Promise<TrackerContentCloudPolicyRefreshResult> {
    try {
      const identity = await this.rpc.getVerifiedIdentity()
      if (this.disposed) return { status: 'skipped', reason: 'disposed' }
      if (identity?.accountUserId !== this.options.accountUserId) {
        return { status: 'skipped', reason: 'session_changed' }
      }
      if (!this.isActiveScope()) return { status: 'skipped', reason: 'scope_changed' }

      const statusResult = await this.refreshViaStatus(identity.accessToken)
      if (statusResult) return statusResult
      return await this.refreshViaCapabilities(identity.accessToken)
    } catch {
      // Never clear a previously usable policy or quota on a temporary RPC,
      // session, or parser failure. The next focus, online, page, or save event
      // can refresh it again while the learner's local content stays usable.
      this.recordRefreshFailure()
      return { status: 'failed' }
    }
  }

  private async refreshViaStatus(
    accessToken: string,
  ): Promise<TrackerContentCloudPolicyRefreshResult | null> {
    if (!this.rpc.getContentCloudStatus) return null
    try {
      const known = trackerContentCloudPolicyStatus(this.options.accountUserId)
      const parsed = parseTrackerContentCloudStatus(await this.rpc.getContentCloudStatus(accessToken, {
        expectedUserId: this.options.accountUserId,
        knownPolicyVersion: known.policyVersion,
        knownOverrideVersion: known.overrideVersion,
        knownContentCursor: known.contentCursor,
      }))
      if (!parsed) return null
      if (this.disposed) return { status: 'skipped', reason: 'disposed' }
      if (!this.isActiveScope()) return { status: 'skipped', reason: 'scope_changed' }
      if (!parsed.changed) {
        const applied = applyTrackerContentCloudPolicyStatus({
          accountUserId: this.options.accountUserId,
          status: parsed.status,
        })
        if (!applied) return { status: 'skipped', reason: 'scope_changed' }
        this.recordSuccessfulRefresh()
        return { status: 'unchanged' }
      }
      const applied = applyTrackerContentCloudCapabilities({
        accountUserId: this.options.accountUserId,
        selectiveCloudAvailable: parsed.selectiveCloudAvailable,
        quota: parsed.quota,
        status: parsed.status,
      })
      if (!applied) return { status: 'skipped', reason: 'scope_changed' }
      this.recordSuccessfulRefresh()
      return { status: 'applied', source: 'status', capabilities: parsed.capabilities }
    } catch (error) {
      // During a compatible rolling deployment, a missing status RPC must use
      // the established capabilities response. Do not turn a network/auth
      // failure into a second long request; keep the prior UI state instead.
      if (isUnavailableStatusRpc(error)) return null
      this.recordRefreshFailure()
      return { status: 'failed' }
    }
  }

  private async refreshViaCapabilities(
    accessToken: string,
  ): Promise<TrackerContentCloudPolicyRefreshResult> {
    const capabilities = parseTrackerSyncCapabilities(await this.rpc.getCapabilities(accessToken))
    if (this.disposed) return { status: 'skipped', reason: 'disposed' }
    if (!this.isActiveScope()) return { status: 'skipped', reason: 'scope_changed' }

    const applied = applyTrackerContentCloudCapabilities({
      accountUserId: this.options.accountUserId,
      selectiveCloudAvailable: capabilities.selectiveContentCloudEnabled,
      quota: capabilities.contentQuota,
      status: { contentCursor: capabilities.currentCursor },
    })
    if (!applied) return { status: 'skipped', reason: 'scope_changed' }
    this.recordSuccessfulRefresh()
    return { status: 'applied', source: 'capabilities', capabilities }
  }
}

function isUnavailableStatusRpc(error: unknown): boolean {
  // Do not depend on `instanceof`: tests, HMR, and a rolling bundle update can
  // legitimately hold two copies of this tiny error class.
  if (typeof error !== 'object' || error === null) return false
  const value = error as { name?: unknown; httpStatus?: unknown; rpcCode?: unknown }
  return value.name === 'TrackerShadowSyncRpcError'
    && (value.httpStatus === 404 || value.rpcCode === 'PGRST202')
}

interface ParsedTrackerContentCloudStatus {
  changed: boolean
  status: TrackerContentCloudPolicyStatus
  selectiveCloudAvailable: boolean
  quota: TrackerSyncCapabilities['contentQuota']
  capabilities: TrackerSyncCapabilities
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * `null` means the endpoint is absent or did not honour the new contract, so
 * callers can use the pre-existing full capabilities RPC during rollout.
 */
function parseTrackerContentCloudStatus(value: unknown): ParsedTrackerContentCloudStatus | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const result = value as Record<string, unknown>
  if (
    typeof result.changed !== 'boolean'
    || typeof result.selectiveContentCloudEnabled !== 'boolean'
  ) return null
  if (
    !isSafeInteger(result.policyVersion)
    || !isSafeInteger(result.overrideVersion)
    || !isSafeInteger(result.contentCursor)
  ) return null
  const status: TrackerContentCloudPolicyStatus = {
    policyVersion: result.policyVersion,
    overrideVersion: result.overrideVersion,
    contentCursor: result.contentCursor,
  }
  if (!result.changed) {
    if (result.contentQuota !== null) return null
    // These values are intentionally unused when unchanged. Keeping a valid
    // capability-shaped result makes the public refresh result predictable.
    const capabilities = parseTrackerSyncCapabilities({
      product: 'tracker', schemaVersion: 1, protocolVersion: 1,
      enabled: true, accountEpoch: 0, currentCursor: result.contentCursor,
      allowedEntityKinds: [], maxBatchSize: 1, maxPayloadBytes: 1,
      selectiveContentCloudV1: true, selectiveContentCloudEnabled: false,
      contentQuota: null,
    })
    return { changed: false, status, selectiveCloudAvailable: false, quota: null, capabilities }
  }
  if (!('contentQuota' in result)) return null
  const capabilities = parseTrackerSyncCapabilities({
    product: 'tracker', schemaVersion: 1, protocolVersion: 1,
    enabled: true, accountEpoch: 0, currentCursor: result.contentCursor,
    allowedEntityKinds: [], maxBatchSize: 1, maxPayloadBytes: 1,
    selectiveContentCloudV1: true,
    selectiveContentCloudEnabled: result.selectiveContentCloudEnabled,
    contentQuota: result.contentQuota,
  })
  return {
    changed: true,
    status,
    selectiveCloudAvailable: capabilities.selectiveContentCloudEnabled,
    quota: capabilities.contentQuota,
    capabilities,
  }
}
