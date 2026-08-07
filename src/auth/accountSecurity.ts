import { safeAuthErrorMessage } from '@/auth/authErrors'
import { safeAuthReturnPath } from '@/auth/authRouting'
import type { AuthActionResult } from '@/auth/authContext'

export type AccountSessionScope = 'local' | 'others' | 'global'

type AccountSecurityError = {
  message?: string
  code?: string
}

type AccountSecurityResponse = Promise<{
  error: AccountSecurityError | null
}>

export type AccountSecurityClient = {
  auth: {
    resetPasswordForEmail: (email: string, options: { redirectTo: string }) => AccountSecurityResponse
    signOut: (options: { scope: AccountSessionScope }) => AccountSecurityResponse
  }
}

function failure(error: unknown): AuthActionResult {
  return { ok: false, message: safeAuthErrorMessage(error) }
}

export function trackerPasswordResetRedirectUrl(
  location: Pick<Location, 'origin' | 'pathname' | 'search'>,
): string {
  const redirectUrl = new URL('/login', location.origin)
  const returnPath = safeAuthReturnPath(`${location.pathname}${location.search}`)
  if (returnPath !== '/') redirectUrl.searchParams.set('returnTo', returnPath)
  return redirectUrl.toString()
}

export function accountSessionScopeAffectsCurrentDevice(scope: AccountSessionScope): boolean {
  return scope !== 'others'
}

export async function sendTrackerPasswordReset(
  email: string,
  redirectTo: string,
  client: AccountSecurityClient,
): Promise<AuthActionResult> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) return { ok: false, message: '当前账户没有可用的邮箱地址。' }

  try {
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
    if (error) return failure(error)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}

export async function signOutTrackerAccountSessions(
  scope: AccountSessionScope,
  client: AccountSecurityClient,
): Promise<AuthActionResult> {
  try {
    const { error } = await client.auth.signOut({ scope })
    if (error) return failure(error)
    return { ok: true }
  } catch (error) {
    return failure(error)
  }
}
