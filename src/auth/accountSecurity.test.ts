import { describe, expect, it, vi } from 'vitest'

import {
  accountSessionScopeAffectsCurrentDevice,
  sendTrackerPasswordReset,
  signOutTrackerAccountSessions,
  trackerPasswordResetRedirectUrl,
  type AccountSecurityClient,
  type AccountSessionScope,
} from '@/auth/accountSecurity'

function createClient(): AccountSecurityClient & {
  auth: {
    resetPasswordForEmail: ReturnType<typeof vi.fn>
    signOut: ReturnType<typeof vi.fn>
  }
} {
  return {
    auth: {
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}

describe('Tracker account security', () => {
  it('sends a normalized account email to the existing Tracker recovery route', async () => {
    const client = createClient()
    const redirectTo = trackerPasswordResetRedirectUrl({
      origin: 'https://ielts-tracker.example',
      pathname: '/plans',
      search: '?view=week',
    })

    await expect(sendTrackerPasswordReset('  Learner@Example.COM ', redirectTo, client)).resolves.toEqual({ ok: true })
    expect(redirectTo).toBe('https://ielts-tracker.example/login?returnTo=%2Fplans%3Fview%3Dweek')
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith('learner@example.com', { redirectTo })
  })

  it('does not issue a recovery request without an account email', async () => {
    const client = createClient()

    await expect(sendTrackerPasswordReset('  ', 'https://ielts-tracker.example/login', client)).resolves.toMatchObject({ ok: false })
    expect(client.auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('keeps provider failures safe for password recovery', async () => {
    const client = createClient()
    client.auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'internal upstream trace learner@example.com token=secret' },
    })

    await expect(sendTrackerPasswordReset('learner@example.com', 'https://ielts-tracker.example/login', client)).resolves.toEqual({
      ok: false,
      message: '账号服务暂时不可用，请稍后再试。',
    })
  })

  it('forwards all Words-aligned session scopes without treating others as a current-device logout', async () => {
    const client = createClient()
    const scopes: AccountSessionScope[] = ['local', 'others', 'global']

    for (const scope of scopes) {
      await expect(signOutTrackerAccountSessions(scope, client)).resolves.toEqual({ ok: true })
    }

    expect(client.auth.signOut).toHaveBeenNthCalledWith(1, { scope: 'local' })
    expect(client.auth.signOut).toHaveBeenNthCalledWith(2, { scope: 'others' })
    expect(client.auth.signOut).toHaveBeenNthCalledWith(3, { scope: 'global' })
    expect(accountSessionScopeAffectsCurrentDevice('local')).toBe(true)
    expect(accountSessionScopeAffectsCurrentDevice('others')).toBe(false)
    expect(accountSessionScopeAffectsCurrentDevice('global')).toBe(true)
  })
})
