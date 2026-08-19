export type TrackerRuntimeSignalKind =
  | 'client_crash'
  | 'sync_failure'
  | 'snapshot_failure'

export type TrackerRuntimeErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'server'
  | 'schema'
  | 'unknown'

export type TrackerRuntimePageKey =
  | 'home'
  | 'plan'
  | 'study'
  | 'library'
  | 'insights'
  | 'test'
  | 'settings'
  | 'auth'
  | 'onboarding'
  | 'unknown'

export type TrackerRuntimeBrowserFamily =
  | 'chrome'
  | 'safari'
  | 'firefox'
  | 'edge'
  | 'opera'
  | 'chrome_ios'
  | 'firefox_ios'
  | 'other'

type ErrorEvidence = {
  name?: unknown
  message?: unknown
  code?: unknown
  rpcCode?: unknown
  serverMessage?: unknown
  status?: unknown
  statusCode?: unknown
  httpStatus?: unknown
}

function boundedEvidence(value: unknown, maximum = 160) {
  if (typeof value === 'number') return String(value)
  if (typeof value !== 'string') return ''
  return value.slice(0, maximum).toLowerCase()
}

function errorEvidence(error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as ErrorEvidence
    return [
      boundedEvidence(candidate.name, 48),
      boundedEvidence(candidate.message),
      boundedEvidence(candidate.code, 40),
      boundedEvidence(candidate.rpcCode, 40),
      boundedEvidence(candidate.serverMessage),
      boundedEvidence(candidate.status, 20),
      boundedEvidence(candidate.statusCode, 20),
      boundedEvidence(candidate.httpStatus, 20),
    ].filter(Boolean).join(' ')
  }
  return boundedEvidence(error)
}

export function classifyTrackerRuntimeError(error: unknown): TrackerRuntimeErrorCode {
  const evidence = errorEvidence(error)
  const source = error && typeof error === 'object' ? error as ErrorEvidence : null
  const status = Number(source?.status ?? source?.statusCode ?? source?.httpStatus)

  if (/aborterror|timeout|timed out|57014/.test(evidence)) return 'timeout'
  if (
    status === 401
    || /(^|\s)28000(\s|$)|jwt|invalid claim|auth session missing|not authenticated/.test(evidence)
  ) return 'unauthorized'
  if (
    status === 403
    || /(^|\s)42501(\s|$)|row-level security|\brls\b|permission denied|forbidden/.test(evidence)
  ) return 'forbidden'
  if (
    status === 409
    || /(^|\s)(40001|23505)(\s|$)|conflict|version mismatch|stale write/.test(evidence)
  ) return 'conflict'
  if (
    /pgrst20[25]|schema cache|function .* does not exist|relation .* does not exist|undefined function|undefined table/.test(evidence)
  ) return 'schema'
  if (
    (Number.isFinite(status) && status >= 500)
    || /(^|\s)(53|57p0|58)[a-z0-9]*(\s|$)|internal server|service unavailable|bad gateway/.test(evidence)
  ) return 'server'
  if (
    /failed to fetch|networkerror|network error|load failed|connection refused|offline/.test(evidence)
    || error instanceof TypeError
  ) return 'network'
  return 'unknown'
}

export function trackerRuntimeBrowserFamily(
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): TrackerRuntimeBrowserFamily {
  if (/Edg\//i.test(userAgent)) return 'edge'
  if (/OPR\//i.test(userAgent)) return 'opera'
  if (/CriOS\//i.test(userAgent)) return 'chrome_ios'
  if (/Chrome\//i.test(userAgent)) return 'chrome'
  if (/FxiOS\//i.test(userAgent)) return 'firefox_ios'
  if (/Firefox\//i.test(userAgent)) return 'firefox'
  if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return 'safari'
  return 'other'
}

export function trackerRuntimePageKey(
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): TrackerRuntimePageKey {
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  if (normalized === '/') return 'home'
  if (/^\/(plans?|plan-detail)(\/|$)/.test(normalized)) return 'plan'
  if (/^\/(practice|timer-practice|reading|listening|speaking)(\/|$)/.test(normalized)) return 'study'
  if (/^\/(words?|vocabulary)(\/|$)/.test(normalized)) return 'library'
  if (/^\/(analytics|achievements|insights)(\/|$)/.test(normalized)) return 'insights'
  if (/^\/(exam|writing)(\/|$)/.test(normalized)) return 'test'
  if (/^\/settings(\/|$)/.test(normalized)) return 'settings'
  if (/^\/(auth|login|register|reset-password)(\/|$)/.test(normalized)) return 'auth'
  if (/^\/onboarding(\/|$)/.test(normalized)) return 'onboarding'
  return 'unknown'
}
