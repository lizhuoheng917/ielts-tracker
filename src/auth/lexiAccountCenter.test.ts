import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LEXI_ACCOUNT_URL,
  resolveLexiAccountCenterUrl,
  safeTrackerAccountCenterReturnPath,
  trackerLexiAccountCenterUrl,
} from '@/auth/lexiAccountCenter'

describe('Lexi Account center hand-off', () => {
  it('uses the reviewed HTTPS account center by default and sends only source plus a safe Tracker return path', () => {
    expect(resolveLexiAccountCenterUrl()).toBe(`${DEFAULT_LEXI_ACCOUNT_URL}/`)
    expect(trackerLexiAccountCenterUrl({
      pathname: '/plans',
      search: '?view=week',
    })).toBe('https://lexi-account.pages.dev/?source=tracker&returnTo=%2Fplans%3Fview%3Dweek')
  })

  it('prefers a configured HTTPS account-center origin', () => {
    expect(trackerLexiAccountCenterUrl(
      { pathname: '/settings', search: '' },
      { accountCenterUrl: 'https://account-staging.lexi.example/' },
    )).toBe('https://account-staging.lexi.example/?source=tracker&returnTo=%2Fsettings')
  })

  it('fails closed for malformed, credentialed, non-root, and insecure remote values', () => {
    for (const accountCenterUrl of [
      'http://lexi-account.pages.dev',
      'https://learner:secret@lexi-account.pages.dev',
      'https://lexi-account.pages.dev/path',
      'https://lexi-account.pages.dev/?target=elsewhere',
      'not a URL',
    ]) {
      expect(resolveLexiAccountCenterUrl({ accountCenterUrl })).toBeNull()
    }
  })

  it('allows HTTP only for loopback URLs in local development', () => {
    expect(resolveLexiAccountCenterUrl({
      accountCenterUrl: 'http://127.0.0.1:5173',
      isDevelopment: true,
    })).toBe('http://127.0.0.1:5173/')
    expect(resolveLexiAccountCenterUrl({
      accountCenterUrl: 'http://127.0.0.1:5173',
      isDevelopment: false,
    })).toBeNull()
    expect(resolveLexiAccountCenterUrl({
      accountCenterUrl: 'http://example.test:5173',
      isDevelopment: true,
    })).toBeNull()
  })

  it('strips unsafe or auth-only Tracker return paths before opening the account center', () => {
    expect(trackerLexiAccountCenterUrl({
      pathname: '//outside.example',
      search: '?token=not-forwarded',
    })).toBe('https://lexi-account.pages.dev/?source=tracker&returnTo=%2F')
    expect(trackerLexiAccountCenterUrl({
      pathname: '/login',
      search: '?returnTo=%2Fplans',
    })).toBe('https://lexi-account.pages.dev/?source=tracker&returnTo=%2F')

    expect(safeTrackerAccountCenterReturnPath({
      pathname: '/plans',
      search: '?view=week&access_token=do-not-forward&TOKEN=also-not-forwarded',
    })).toBe('/plans?view=week')
    expect(trackerLexiAccountCenterUrl({
      pathname: '/plans',
      search: '?view=week&refresh_token=do-not-forward',
    })).toBe('https://lexi-account.pages.dev/?source=tracker&returnTo=%2Fplans%3Fview%3Dweek')
  })
})
