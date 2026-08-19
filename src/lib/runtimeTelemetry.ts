import { supabase } from '@/lib/supabase'
import {
  classifyTrackerRuntimeError,
  trackerRuntimeBrowserFamily,
  trackerRuntimePageKey,
  type TrackerRuntimePageKey,
  type TrackerRuntimeSignalKind,
} from '@/lib/runtimeTelemetryModel'

export {
  classifyTrackerRuntimeError,
  trackerRuntimeBrowserFamily,
  trackerRuntimePageKey,
  type TrackerRuntimeBrowserFamily,
  type TrackerRuntimeErrorCode,
  type TrackerRuntimePageKey,
  type TrackerRuntimeSignalKind,
} from '@/lib/runtimeTelemetryModel'

type RuntimeTelemetryClient = Pick<NonNullable<typeof supabase>, 'auth' | 'rpc'>

export type TrackerRuntimeSignal = {
  kind: TrackerRuntimeSignalKind
  error?: unknown
  pendingCount?: number
  pageKey?: TrackerRuntimePageKey
}

const reportCooldownMs = 15 * 60 * 1000
const reportedSignals = new Map<string, number>()
let globalListenersInstalled = false

function trackerRuntimeBuildSha() {
  const build = (
    import.meta.env.VITE_CF_PAGES_COMMIT_SHA
    || import.meta.env.VITE_GIT_COMMIT_SHA
    || import.meta.env.VITE_APP_BUILD_SHA
    || ''
  ).trim().toLowerCase()
  return /^[0-9a-f]{7,64}$/.test(build) ? build : 'unknown'
}

function boundedPendingCount(value: unknown) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(9999, Math.round(Number(value))))
    : 0
}

function shouldReport(key: string, now: number) {
  const previous = reportedSignals.get(key) || 0
  if (now - previous < reportCooldownMs) return false
  reportedSignals.set(key, now)
  return true
}

/**
 * Best-effort and deliberately silent. Only closed enums, a bounded queue
 * count and coarse build/browser labels reach the shared aggregate RPC.
 */
export async function reportTrackerRuntimeSignal(
  signal: TrackerRuntimeSignal,
  client: RuntimeTelemetryClient | null = supabase,
) {
  if (
    !client
    || typeof navigator === 'undefined'
    || !navigator.onLine
  ) return false

  const code = classifyTrackerRuntimeError(signal.error)
  const page = signal.pageKey || trackerRuntimePageKey()
  const dedupeKey = `${signal.kind}:${code}:${page}`
  if (!shouldReport(dedupeKey, Date.now())) return false

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession()
    if (sessionError || !sessionData.session?.user) return false
    const { error } = await client.rpc('report_product_runtime_signal', {
      p_product_id: 'tracker',
      p_surface: 'learner',
      p_signal_kind: signal.kind,
      p_error_code: code,
      p_build_sha: trackerRuntimeBuildSha(),
      p_page_key: page,
      p_browser_family: trackerRuntimeBrowserFamily(),
      p_pending_count: boundedPendingCount(signal.pendingCount),
    })
    return !error
  } catch {
    return false
  }
}

export function installTrackerRuntimeTelemetry() {
  if (globalListenersInstalled || typeof window === 'undefined') return
  globalListenersInstalled = true
  window.addEventListener('error', (event) => {
    void reportTrackerRuntimeSignal({
      kind: 'client_crash',
      error: event.error || event.message,
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    void reportTrackerRuntimeSignal({
      kind: 'client_crash',
      error: event.reason,
    })
  })
}

export function resetTrackerRuntimeTelemetryForTests() {
  reportedSignals.clear()
  globalListenersInstalled = false
}
