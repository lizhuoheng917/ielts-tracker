import { useCallback, useEffect, useRef, useState } from 'react'

import {
  AI_GATEWAY_PRODUCT_ID,
  type ManagedAiPurpose,
} from './gateway'

export const MANAGED_AI_QUOTA_REFRESH_EVENT = 'lexi:managed-ai-quota-refresh'

export interface ManagedAiQuota {
  schemaVersion: 1
  productId: typeof AI_GATEWAY_PRODUCT_ID
  purpose: ManagedAiPurpose
  enabled: boolean
  dailyRequestLimit: number | null
  remainingRequests: number | null
  resetAt: string | null
}

export interface ManagedAiQuotaState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  quota: ManagedAiQuota | null
}

export interface ManagedAiQuotaActionState {
  blocked: boolean
  reason: 'loading' | 'disabled' | 'exhausted' | null
}

export type ManagedAiQuotaInvoker = (purpose: ManagedAiPurpose) => Promise<unknown>

/**
 * Keeps explicit AI actions from racing an unfinished quota read or consuming a
 * request after the account has no requests left. An unavailable preview stays
 * non-blocking because the gateway remains the authoritative admission check.
 */
export function managedAiQuotaActionState(
  state: ManagedAiQuotaState,
  requiredUnits = 1,
): ManagedAiQuotaActionState {
  if (state.status === 'idle' || state.status === 'loading') {
    return { blocked: true, reason: 'loading' }
  }
  if (state.status !== 'ready' || !state.quota) {
    return { blocked: false, reason: null }
  }
  if (!state.quota.enabled) {
    return { blocked: true, reason: 'disabled' }
  }
  if (state.quota.remainingRequests !== null && state.quota.remainingRequests < requiredUnits) {
    return { blocked: true, reason: 'exhausted' }
  }
  return { blocked: false, reason: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 32_767
}

/**
 * Parses the intentionally small, per-account quota preview. This is not an
 * admission decision: the gateway's reserve RPC remains the atomic authority.
 */
export function parseManagedAiQuota(value: unknown, purpose: ManagedAiPurpose): ManagedAiQuota {
  if (!isRecord(value)) throw new Error('AI quota response is invalid')
  if (value.schemaVersion !== 1 || value.productId !== AI_GATEWAY_PRODUCT_ID || value.purpose !== purpose) {
    throw new Error('AI quota response does not match the requested feature')
  }
  if (typeof value.enabled !== 'boolean') throw new Error('AI quota enabled state is invalid')

  if (!value.enabled) {
    if (value.dailyRequestLimit !== null || value.remainingRequests !== null || value.resetAt !== null) {
      throw new Error('Disabled AI quota response must not expose limits')
    }
    return {
      schemaVersion: 1,
      productId: AI_GATEWAY_PRODUCT_ID,
      purpose,
      enabled: false,
      dailyRequestLimit: null,
      remainingRequests: null,
      resetAt: null,
    }
  }

  if (!isBoundedCount(value.dailyRequestLimit) || !isBoundedCount(value.remainingRequests)) {
    throw new Error('AI quota counts are invalid')
  }
  if (value.remainingRequests > value.dailyRequestLimit) {
    throw new Error('AI quota remaining count is invalid')
  }
  if (typeof value.resetAt !== 'string' || !Number.isFinite(Date.parse(value.resetAt))) {
    throw new Error('AI quota reset time is invalid')
  }

  return {
    schemaVersion: 1,
    productId: AI_GATEWAY_PRODUCT_ID,
    purpose,
    enabled: true,
    dailyRequestLimit: value.dailyRequestLimit,
    remainingRequests: value.remainingRequests,
    resetAt: value.resetAt,
  }
}

async function invokeManagedAiQuotaRpc(purpose: ManagedAiPurpose): Promise<unknown> {
  const { supabase } = await import('@/lib/supabase')
  if (!supabase) throw new Error('AI quota is not configured')
  const { data, error } = await supabase.rpc('ai_gateway_get_quota', {
    p_product: AI_GATEWAY_PRODUCT_ID,
    p_feature: purpose,
  })
  if (error) throw new Error('AI quota is unavailable')
  return data
}

export async function loadManagedAiQuota(
  purpose: ManagedAiPurpose,
  invoke: ManagedAiQuotaInvoker = invokeManagedAiQuotaRpc,
): Promise<ManagedAiQuota> {
  return parseManagedAiQuota(await invoke(purpose), purpose)
}

/** Refreshes only open dialogs after a managed request has reached a terminal browser state. */
export function notifyManagedAiQuotaChanged(purpose: ManagedAiPurpose): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<{ purpose: ManagedAiPurpose }>(
    MANAGED_AI_QUOTA_REFRESH_EVENT,
    { detail: { purpose } },
  ))
}

/** Formats the server's UTC reset timestamp in the learner's own local time. */
export function formatManagedAiQuotaResetAt(resetAt: string): string | null {
  const date = new Date(resetAt)
  if (!Number.isFinite(date.getTime())) return null
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * Reads once when an AI dialog opens, refreshes after a local managed request
 * settles, and refreshes when the tab regains focus. It deliberately does not
 * poll the database; the one reset-time refresh keeps the display current
 * across the daily UTC boundary without creating background traffic.
 */
export function useManagedAiQuota(
  purpose: ManagedAiPurpose,
  active = true,
): { state: ManagedAiQuotaState; refresh: () => Promise<void> } {
  const [state, setState] = useState<ManagedAiQuotaState>({ status: 'idle', quota: null })
  const requestVersion = useRef(0)

  const refresh = useCallback(async () => {
    if (!active) return
    const version = ++requestVersion.current
    setState((current) => ({ status: 'loading', quota: current.quota }))
    try {
      const quota = await loadManagedAiQuota(purpose)
      if (version !== requestVersion.current) return
      setState({ status: 'ready', quota })
    } catch {
      if (version !== requestVersion.current) return
      // Do not leave a stale count on screen after a failed refresh.
      setState({ status: 'unavailable', quota: null })
    }
  }, [active, purpose])

  useEffect(() => {
    if (active) {
      void refresh()
      return () => {
        requestVersion.current += 1
      }
    }
    requestVersion.current += 1
    setState({ status: 'idle', quota: null })
  }, [active, refresh])

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const refreshOnFocus = () => { void refresh() }
    const refreshOnManagedRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ purpose?: unknown }>).detail
      if (detail?.purpose === purpose) void refresh()
    }
    window.addEventListener('focus', refreshOnFocus)
    window.addEventListener(MANAGED_AI_QUOTA_REFRESH_EVENT, refreshOnManagedRequest)
    return () => {
      window.removeEventListener('focus', refreshOnFocus)
      window.removeEventListener(MANAGED_AI_QUOTA_REFRESH_EVENT, refreshOnManagedRequest)
    }
  }, [active, purpose, refresh])

  const resetAt = state.quota?.resetAt
  useEffect(() => {
    if (!active || !resetAt || typeof window === 'undefined') return
    const delay = Math.max(0, Date.parse(resetAt) - Date.now()) + 300
    const timer = window.setTimeout(() => { void refresh() }, delay)
    return () => window.clearTimeout(timer)
  }, [active, refresh, resetAt])

  return { state, refresh }
}
