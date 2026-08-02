export const AUTH_STORAGE_KEY = 'lexi-tracker-auth-v2'
export const LEXI_PRODUCTION_PROJECT_REF = 'olkvqmnuyxuddgpcordp'
export const LEXI_STAGING_PROJECT_REF = 'kkynryhceurvnylprxyx'

export type LexiEnvironment = 'local' | 'staging' | 'production'

export type AuthConfiguration =
  | { status: 'unconfigured' }
  | {
      status: 'misconfigured'
      reason:
        | 'missing-value'
        | 'invalid-url'
        | 'unsafe-key'
        | 'invalid-environment'
        | 'invalid-project-ref'
        | 'project-ref-mismatch'
        | 'production-target'
    }
  | {
      status: 'ready'
      url: string
      publishableKey: string
      environment: LexiEnvironment
      projectRef: string | null
    }

type AuthEnvironment = {
  VITE_LEXI_ENVIRONMENT?: unknown
  VITE_SUPABASE_URL?: unknown
  VITE_SUPABASE_PUBLISHABLE_KEY?: unknown
  VITE_SUPABASE_PROJECT_REF?: unknown
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isAllowedSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return false
    if (url.protocol === 'https:') return !url.port
    return isLocalSupabaseUrl(value)
  } catch {
    return false
  }
}

function isLocalSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

function environmentLabel(value: unknown): LexiEnvironment | null {
  const normalized = trimmedString(value).toLowerCase()
  if (normalized === 'local' || normalized === 'staging' || normalized === 'production') {
    return normalized
  }
  return null
}

function officialProjectRef(value: string): string | null {
  try {
    const url = new URL(value)
    const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

function validProjectRef(value: string): boolean {
  return /^[a-z0-9]{20}$/.test(value)
}

function decodeJwtPayload(key: string): Record<string, unknown> | null {
  const payload = key.split('.')[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = globalThis.atob(padded)
    return JSON.parse(decoded) as Record<string, unknown>
  } catch {
    return null
  }
}

function isUnsafeBrowserKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  return decodeJwtPayload(key)?.role === 'service_role'
}

function isBrowserPublishableKey(key: string): boolean {
  if (key.startsWith('sb_publishable_')) return key.length > 'sb_publishable_'.length
  return decodeJwtPayload(key)?.role === 'anon'
}

export function resolveAuthConfiguration(env: AuthEnvironment): AuthConfiguration {
  const environmentInput = trimmedString(env.VITE_LEXI_ENVIRONMENT)
  const environment = environmentLabel(env.VITE_LEXI_ENVIRONMENT)
  const url = trimmedString(env.VITE_SUPABASE_URL)
  const publishableKey = trimmedString(env.VITE_SUPABASE_PUBLISHABLE_KEY)
  const declaredProjectRef = trimmedString(env.VITE_SUPABASE_PROJECT_REF).toLowerCase()

  if (!url && !publishableKey && !declaredProjectRef && !environmentInput) {
    return { status: 'unconfigured' }
  }
  if (!url || !publishableKey) return { status: 'misconfigured', reason: 'missing-value' }
  if (!environment) return { status: 'misconfigured', reason: 'invalid-environment' }
  if (!isAllowedSupabaseUrl(url)) return { status: 'misconfigured', reason: 'invalid-url' }
  if (isUnsafeBrowserKey(publishableKey) || !isBrowserPublishableKey(publishableKey)) {
    return { status: 'misconfigured', reason: 'unsafe-key' }
  }

  if (declaredProjectRef && !validProjectRef(declaredProjectRef)) {
    return { status: 'misconfigured', reason: 'invalid-project-ref' }
  }

  const urlProjectRef = officialProjectRef(url)
  if (declaredProjectRef && urlProjectRef !== declaredProjectRef) {
    return { status: 'misconfigured', reason: 'project-ref-mismatch' }
  }

  if (environment === 'staging') {
    if (!declaredProjectRef || !urlProjectRef) {
      return { status: 'misconfigured', reason: 'project-ref-mismatch' }
    }
    if (declaredProjectRef === LEXI_PRODUCTION_PROJECT_REF) {
      return { status: 'misconfigured', reason: 'production-target' }
    }
    if (declaredProjectRef !== LEXI_STAGING_PROJECT_REF) {
      return { status: 'misconfigured', reason: 'project-ref-mismatch' }
    }
  }

  if (environment === 'local' && !isLocalSupabaseUrl(url)) {
    return { status: 'misconfigured', reason: 'production-target' }
  }

  if (environment === 'production') {
    if (!declaredProjectRef || !urlProjectRef) {
      return { status: 'misconfigured', reason: 'project-ref-mismatch' }
    }
    if (declaredProjectRef !== LEXI_PRODUCTION_PROJECT_REF) {
      return { status: 'misconfigured', reason: 'project-ref-mismatch' }
    }
  }

  return {
    status: 'ready',
    url,
    publishableKey,
    environment: isLocalSupabaseUrl(url) ? 'local' : environment,
    projectRef: urlProjectRef,
  }
}

export function getAuthStorageKey(
  configuration: Extract<AuthConfiguration, { status: 'ready' }>,
): string {
  const target = configuration.projectRef
    ?? new URL(configuration.url).host.toLowerCase().replace(/[^a-z0-9.-]/g, '_')
  return `${AUTH_STORAGE_KEY}:${configuration.environment}:${target}`
}
