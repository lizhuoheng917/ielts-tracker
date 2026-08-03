import { authConfiguration } from '@/auth/runtimeConfiguration'
import type { TrackerShadowSyncOperation } from '@/sync/trackerShadowSyncProtocol'

export interface TrackerShadowSyncIdentity {
  accountUserId: string
  accessToken: string
}

export class TrackerShadowSyncRpcError extends Error {
  readonly httpStatus: number
  readonly rpcCode: string | null
  readonly serverMessage: string | null

  constructor(input: {
    httpStatus: number
    rpcCode?: string | null
    serverMessage?: string | null
  }) {
    const code = input.rpcCode ?? null
    const serverMessage = input.serverMessage ?? null
    super(`Tracker shadow sync RPC failed with HTTP ${input.httpStatus}${code ? ` (${code})` : ''}.`)
    this.name = 'TrackerShadowSyncRpcError'
    this.httpStatus = input.httpStatus
    this.rpcCode = code
    this.serverMessage = serverMessage
  }
}

export interface TrackerShadowSyncRpc {
  getVerifiedIdentity(): Promise<TrackerShadowSyncIdentity | null>
  getCapabilities(accessToken: string): Promise<unknown>
  applyBatch(accessToken: string, input: {
    deviceId: string
    requestId: string
    requestHash: string
    accountEpoch: number
    operations: readonly TrackerShadowSyncOperation[]
  }): Promise<unknown>
  pull(accessToken: string, input: {
    deviceId: string
    cursor: number
    limit: number
  }): Promise<unknown>
  getSnapshot(accessToken: string, input: { deviceId: string }): Promise<unknown>
}

async function invokePinnedRpc(
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  if (authConfiguration.status !== 'ready') {
    throw new Error('Tracker shadow sync is not configured.')
  }
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`${authConfiguration.url}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: authConfiguration.publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      let rpcCode: string | null = null
      let serverMessage: string | null = null
      try {
        const payload = await response.json() as unknown
        if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
          const value = payload as Record<string, unknown>
          rpcCode = typeof value.code === 'string' ? value.code : null
          serverMessage = typeof value.message === 'string' ? value.message : null
        }
      } catch {
        // Keep the typed HTTP status even when a proxy returns a non-JSON body.
      }
      throw new TrackerShadowSyncRpcError({
        httpStatus: response.status,
        rpcCode,
        serverMessage,
      })
    }
    return response.json() as Promise<unknown>
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

export const browserTrackerShadowSyncRpc: TrackerShadowSyncRpc = {
  getVerifiedIdentity: async () => {
    const { supabase } = await import('@/lib/supabase')
    if (!supabase) return null
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (sessionError || !accessToken) return null
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) return null
    return { accountUserId: data.user.id, accessToken }
  },
  getCapabilities: (accessToken) => invokePinnedRpc(
    'tracker_get_sync_capabilities',
    accessToken,
    {},
  ),
  applyBatch: (accessToken, input) => invokePinnedRpc(
    'tracker_apply_sync_batch',
    accessToken,
    {
      p_device_id: input.deviceId,
      p_request_id: input.requestId,
      p_request_hash: input.requestHash,
      p_account_epoch: input.accountEpoch,
      p_operations: input.operations,
    },
  ),
  pull: (accessToken, input) => invokePinnedRpc(
    'tracker_pull_sync',
    accessToken,
    {
      p_device_id: input.deviceId,
      p_cursor: input.cursor,
      p_limit: input.limit,
    },
  ),
  getSnapshot: (accessToken, input) => invokePinnedRpc(
    'tracker_get_sync_snapshot',
    accessToken,
    { p_device_id: input.deviceId },
  ),
}
