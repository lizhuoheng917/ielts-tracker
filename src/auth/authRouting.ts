export type TrackerAuthMode = 'sign-in' | 'sign-up' | 'forgot'

export function authPathForMode(mode: TrackerAuthMode): string {
  if (mode === 'sign-up') return '/register'
  if (mode === 'forgot') return '/forgot-password'
  return '/login'
}

export function authModeForPath(pathname: string): TrackerAuthMode {
  if (pathname === '/register') return 'sign-up'
  if (pathname === '/forgot-password') return 'forgot'
  return 'sign-in'
}

export function safeAuthReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value === '/login' || value === '/register' || value === '/forgot-password') return '/'
  if (value.startsWith('/auth/')) return '/'
  return value
}
