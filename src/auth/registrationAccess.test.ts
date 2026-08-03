import { describe, expect, it } from 'vitest'

import {
  hashInviteCode,
  normalizeInviteCode,
  parseRegistrationAccessPolicy,
} from '@/auth/registrationAccess'

describe('Tracker registration access', () => {
  it('accepts only the shared Lexi registration modes', () => {
    expect(parseRegistrationAccessPolicy({ mode: 'open' })).toEqual({ mode: 'open' })
    expect(parseRegistrationAccessPolicy({ mode: 'invite_only' })).toEqual({ mode: 'invite_only' })
    expect(() => parseRegistrationAccessPolicy({ mode: 'anything' })).toThrow('Registration access policy')
  })

  it('normalizes and hashes an invite without retaining its presentation separators', async () => {
    const canonical = 'LEXIABCDEFGHJKLMNPQRSTUVWXYZ'
    expect(normalizeInviteCode('lexi-abcdef-ghjklm-npqrst-uvwxyz')).toBe(canonical)
    await expect(hashInviteCode('LEXI-ABCDEF-GHJKLM-NPQRST-UVWXYZ')).resolves.toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects malformed invite values before hashing', async () => {
    expect(normalizeInviteCode('LEXI-123')).toBeNull()
    await expect(hashInviteCode('LEXI-123')).rejects.toThrow('邀请码格式无效')
  })
})
