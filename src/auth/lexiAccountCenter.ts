import { safeAuthReturnPath } from '@/auth/authRouting'

export const DEFAULT_LEXI_ACCOUNT_URL = 'https://lexi-account.pages.dev'

type AccountCenterLocation = Pick<Location, 'pathname' | 'search'>

export type LexiAccountCenterEnvironment = {
  accountCenterUrl?: unknown
  isDevelopment?: boolean
}

const SENSITIVE_RETURN_TO_PARAMS = new Set([
  'access_token',
  'refresh_token',
  'token',
  'token_hash',
  'code',
  'session',
  'session_id',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
])

function configuredUrl(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null
  return value.trim()
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * Account-center URLs are deployment configuration, not user input. Even so,
 * fail closed rather than turning a malformed public Vite value into an open
 * redirect. HTTP is permitted only for a loopback URL during local development.
 */
export function resolveLexiAccountCenterUrl(
  environment: LexiAccountCenterEnvironment = {},
): string | null {
  const configured = configuredUrl(environment.accountCenterUrl)
  if (configured === null) return null

  try {
    const url = new URL(configured || DEFAULT_LEXI_ACCOUNT_URL)
    const isSecureRemoteUrl = url.protocol === 'https:'
    const isAllowedLocalUrl = Boolean(environment.isDevelopment)
      && url.protocol === 'http:'
      && isLoopbackHost(url.hostname)

    if (!isSecureRemoteUrl && !isAllowedLocalUrl) return null
    if (url.username || url.password || url.search || url.hash) return null
    if (url.pathname !== '/' && url.pathname !== '') return null

    return url.toString()
  } catch {
    return null
  }
}

export function safeTrackerAccountCenterReturnPath(location: AccountCenterLocation): string {
  const safePathname = safeAuthReturnPath(location.pathname)
  if (safePathname === '/') return '/'

  const query = new URLSearchParams(location.search)
  for (const key of [...query.keys()]) {
    if (SENSITIVE_RETURN_TO_PARAMS.has(key.toLowerCase())) query.delete(key)
  }
  const serializedQuery = query.toString()
  return safeAuthReturnPath(serializedQuery ? `${safePathname}?${serializedQuery}` : safePathname)
}

/**
 * Creates the only cross-product hand-off supported by Tracker's native
 * account panel. No token, account id, device id, or learning data travels in
 * the URL: the account center receives only a fixed source and a vetted local
 * return path.
 */
export function trackerLexiAccountCenterUrl(
  location: AccountCenterLocation,
  environment: LexiAccountCenterEnvironment = {},
): string | null {
  const baseUrl = resolveLexiAccountCenterUrl(environment)
  if (!baseUrl) return null

  const url = new URL(baseUrl)
  const returnTo = safeTrackerAccountCenterReturnPath(location)
  url.searchParams.set('source', 'tracker')
  url.searchParams.set('returnTo', returnTo)
  return url.toString()
}
