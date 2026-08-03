import { describe, expect, it } from 'vitest'

import {
  inspectTrackerEmailConfirmationUrl,
  isTrackerEmailConfirmationCallback,
  isTrackerPasswordRecoveryCallback,
  trackerEmailConfirmationRedirectUrl,
} from '@/auth/emailConfirmation'

function storageWith(value: string | null) {
  let current = value
  return {
    getItem: () => current,
    setItem: (_key: string, next: string) => { current = next },
    removeItem: () => { current = null },
    current: () => current,
  }
}

describe('Tracker email confirmation callback', () => {
  it('recognizes only signup callbacks that carry a result', () => {
    expect(isTrackerEmailConfirmationCallback({
      pathname: '/auth/confirmed',
      search: '',
      hash: '#type=signup&access_token=token&refresh_token=refresh',
    })).toBe(true)
    expect(isTrackerEmailConfirmationCallback({
      pathname: '/auth/confirmed',
      search: '',
      hash: '#type=recovery&access_token=token&refresh_token=refresh',
    })).toBe(false)
    expect(isTrackerPasswordRecoveryCallback({
      pathname: '/login',
      search: '',
      hash: '#type=recovery&access_token=token&refresh_token=refresh',
    })).toBe(true)
  })

  it('shows success only after this origin stored a recent confirmation marker', () => {
    const now = Date.now()
    const storage = storageWith(JSON.stringify({ confirmedAt: now }))
    expect(inspectTrackerEmailConfirmationUrl({
      pathname: '/auth/confirmed',
      search: '?status=success',
      hash: '',
    }, storage, now)).toEqual({ kind: 'success' })

    const expired = storageWith(JSON.stringify({ confirmedAt: now - 3 * 60 * 60 * 1000 }))
    expect(inspectTrackerEmailConfirmationUrl({
      pathname: '/auth/confirmed',
      search: '?status=success',
      hash: '',
    }, expired, now)).toEqual({ kind: 'invalid' })
    expect(expired.current()).toBeNull()
  })

  it('uses the Tracker confirmation page as the email callback target', () => {
    expect(trackerEmailConfirmationRedirectUrl('https://tracker.example.com')).toBe(
      'https://tracker.example.com/auth/confirmed',
    )
  })
})
