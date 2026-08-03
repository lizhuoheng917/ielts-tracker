import { describe, expect, it } from 'vitest'

import { authModeForPath, authPathForMode, safeAuthReturnPath } from '@/auth/authRouting'

describe('Tracker auth routing', () => {
  it('maps the three public account pages without exposing auth callback routes', () => {
    expect(authPathForMode('sign-in')).toBe('/login')
    expect(authPathForMode('sign-up')).toBe('/register')
    expect(authPathForMode('forgot')).toBe('/forgot-password')
    expect(authModeForPath('/register')).toBe('sign-up')
    expect(authModeForPath('/forgot-password')).toBe('forgot')
    expect(authModeForPath('/anything-else')).toBe('sign-in')
  })

  it('allows only safe in-app return destinations', () => {
    expect(safeAuthReturnPath('/plans?tab=ai')).toBe('/plans?tab=ai')
    expect(safeAuthReturnPath('//outside.example')).toBe('/')
    expect(safeAuthReturnPath('https://outside.example')).toBe('/')
    expect(safeAuthReturnPath('/auth/confirmed')).toBe('/')
    expect(safeAuthReturnPath('/login')).toBe('/')
  })
})
