import { createClient } from '@supabase/supabase-js'

import { authConfiguration } from '@/auth/runtimeConfiguration'

export const trackerEmailConfirmationPath = '/auth/confirmed'

const confirmationResultStorageKey = 'lexi-tracker-email-confirmation-result-v1'
const confirmationResultLifetimeMs = 2 * 60 * 60 * 1000
let confirmationCompletion: Promise<void> | null = null

type LocationLike = Pick<Location, 'pathname' | 'search' | 'hash'>
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type EmailConfirmationUrlState =
  | { kind: 'callback' }
  | { kind: 'error'; code: string }
  | { kind: 'success' }
  | { kind: 'invalid' }

export class EmailConfirmationError extends Error {
  code: string

  constructor(code: string) {
    super(code)
    this.name = 'EmailConfirmationError'
    this.code = code
  }
}

function parameters(value: string): URLSearchParams {
  return new URLSearchParams(value.replace(/^[?#]/, ''))
}

function readStoredSuccess(storage: StorageLike, now: number): boolean {
  const raw = storage.getItem(confirmationResultStorageKey)
  if (!raw) return false
  try {
    const value = JSON.parse(raw) as { confirmedAt?: unknown }
    const confirmedAt = Number(value.confirmedAt)
    if (Number.isFinite(confirmedAt) && confirmedAt > 0 && now - confirmedAt <= confirmationResultLifetimeMs) {
      return true
    }
  } catch {
    // An invalid marker cannot turn an arbitrary URL into a success page.
  }
  storage.removeItem(confirmationResultStorageKey)
  return false
}

export function isTrackerEmailConfirmationRoute(
  location: LocationLike = window.location,
): boolean {
  return location.pathname.replace(/\/+$/, '') === trackerEmailConfirmationPath
}

export function isTrackerEmailConfirmationCallback(
  location: LocationLike = window.location,
): boolean {
  const search = parameters(location.search)
  const hash = parameters(location.hash)
  const callbackType = hash.get('type') || search.get('type')
  return callbackType === 'signup' && Boolean(
    hash.get('access_token')
    || hash.get('error')
    || hash.get('error_code')
    || search.get('error')
    || search.get('error_code'),
  )
}

export function isTrackerPasswordRecoveryCallback(
  location: LocationLike = window.location,
): boolean {
  const search = parameters(location.search)
  const hash = parameters(location.hash)
  const callbackType = hash.get('type') || search.get('type')
  return callbackType === 'recovery' && Boolean(
    hash.get('access_token')
    || hash.get('error')
    || hash.get('error_code')
    || search.get('error')
    || search.get('error_code'),
  )
}

export function shouldHandleTrackerEmailConfirmation(
  location: LocationLike = window.location,
): boolean {
  return isTrackerEmailConfirmationRoute(location) || isTrackerEmailConfirmationCallback(location)
}

export function trackerEmailConfirmationRedirectUrl(origin: string = window.location.origin): string {
  return new URL(trackerEmailConfirmationPath, `${new URL(origin).origin}/`).toString()
}

export function inspectTrackerEmailConfirmationUrl(
  location: LocationLike = window.location,
  storage: StorageLike = window.sessionStorage,
  now = Date.now(),
): EmailConfirmationUrlState {
  if (!shouldHandleTrackerEmailConfirmation(location)) return { kind: 'invalid' }

  const search = parameters(location.search)
  const hash = parameters(location.hash)
  const errorCode = hash.get('error_code') || search.get('error_code') || hash.get('error') || search.get('error')
  if (errorCode) return { kind: 'error', code: errorCode }

  const callbackType = hash.get('type') || search.get('type')
  const hasImplicitTokens = Boolean(hash.get('access_token') && hash.get('refresh_token'))
  if (callbackType === 'signup' && hasImplicitTokens) return { kind: 'callback' }

  if (search.get('status') === 'success' && readStoredSuccess(storage, now)) {
    return { kind: 'success' }
  }
  return { kind: 'invalid' }
}

function rememberSuccess(storage: StorageLike, now: number): void {
  storage.setItem(confirmationResultStorageKey, JSON.stringify({ confirmedAt: now }))
}

async function completeEmailConfirmation(): Promise<void> {
  const inspected = inspectTrackerEmailConfirmationUrl()
  if (inspected.kind === 'error') throw new EmailConfirmationError(inspected.code)
  if (inspected.kind !== 'callback') throw new EmailConfirmationError('confirmation_callback_missing')
  if (authConfiguration.status !== 'ready') {
    throw new EmailConfirmationError('confirmation_service_unavailable')
  }

  // A confirmation URL can include a temporary session. Keep it isolated so
  // opening an email never silently signs a learner into Tracker.
  const confirmationClient = createClient(
    authConfiguration.url,
    authConfiguration.publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true,
        storageKey: 'lexi-tracker-email-confirmation-transient-v1',
      },
    },
  )
  const { data, error } = await confirmationClient.auth.getSession()
  if (error) throw new EmailConfirmationError(error.code || 'confirmation_exchange_failed')

  const user = data.session?.user
  if (!user || !(user.email_confirmed_at || user.confirmed_at)) {
    throw new EmailConfirmationError('confirmation_not_verified')
  }

  try {
    await confirmationClient.auth.signOut({ scope: 'local' })
  } catch {
    // This client has no persistent storage. Cleanup failure cannot persist a session.
  }

  rememberSuccess(window.sessionStorage, Date.now())
  window.history.replaceState({}, document.title, `${trackerEmailConfirmationPath}?status=success`)
}

export function completeTrackerEmailConfirmationFromUrl(): Promise<void> {
  if (!confirmationCompletion) confirmationCompletion = completeEmailConfirmation()
  return confirmationCompletion
}

export function trackerEmailConfirmationErrorCopy(error: unknown): { title: string; description: string } {
  const code = error instanceof EmailConfirmationError ? error.code : ''
  if (/otp_expired|expired|confirmation_exchange_failed/i.test(code)) {
    return {
      title: '验证链接已失效',
      description: '请回到注册页重新操作，再使用最新收到的验证邮件。',
    }
  }
  if (/access_denied|forbidden/i.test(code)) {
    return {
      title: '邮箱验证未完成',
      description: '这个链接无法完成验证，请回到注册页重新尝试。',
    }
  }
  return {
    title: '暂时无法确认注册结果',
    description: '请检查网络后重新打开验证链接；如果仍有问题，可以返回登录页稍后再试。',
  }
}
