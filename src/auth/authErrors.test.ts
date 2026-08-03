import { describe, expect, it } from 'vitest'

import { safeAuthErrorMessage } from '@/auth/authErrors'

describe('safeAuthErrorMessage', () => {
  it('maps common authentication failures to safe Chinese copy', () => {
    expect(safeAuthErrorMessage(new Error('Invalid login credentials'))).toContain('邮箱或密码')
    expect(safeAuthErrorMessage(new Error('Email not confirmed'))).toContain('验证邮件')
    expect(safeAuthErrorMessage(new Error('Too many requests'))).toContain('稍后')
    expect(safeAuthErrorMessage(new TypeError('Failed to fetch'))).toContain('网络')
    expect(safeAuthErrorMessage(new Error('LEXI_REGISTRATION_CLOSED'))).toContain('暂未开放')
    expect(safeAuthErrorMessage(new Error('邀请码格式无效'))).toContain('邀请码')
  })

  it('does not expose unknown provider details', () => {
    const raw = 'internal upstream trace abc123@example.com token=secret'
    const result = safeAuthErrorMessage(new Error(raw))
    expect(result).toBe('账号服务暂时不可用，请稍后再试。')
    expect(result).not.toContain('abc123')
    expect(result).not.toContain('secret')
  })
})
