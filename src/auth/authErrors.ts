export function safeAuthErrorMessage(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  const evidence = `${String(record.code ?? '')} ${message}`

  if (/LEXI_REGISTRATION_CLOSED|signup_disabled/i.test(evidence)) return '当前暂未开放新账户注册，已有账户仍可正常登录。'
  if (/LEXI_INVITATION_INVALID|邀请码格式无效/i.test(evidence)) return '邀请码无效或当前不可用，请确认后重试。'
  if (/LEXI_REGISTRATION_POLICY_UNAVAILABLE|hook_timeout/i.test(evidence)) return '暂时无法确认注册状态，请稍后再试。'
  if (/invalid login credentials/i.test(evidence)) return '邮箱或密码不正确，请重新输入。'
  if (/email not confirmed/i.test(evidence)) return '请先打开验证邮件完成邮箱确认。'
  if (/user_already_exists|email_exists|user already registered/i.test(evidence)) return '该账号已注册，请直接登录。'
  if (/weak_password|password should be at least/i.test(evidence)) return '密码长度至少为 8 位。'
  if (/too many requests|rate limit/i.test(evidence)) return '尝试次数较多，请稍后再试。'
  if (/failed to fetch|network|offline|timeout/i.test(evidence)) return '暂时无法连接账号服务，请检查网络后重试。'

  return '账号服务暂时不可用，请稍后再试。'
}
