export function safeAuthErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''

  if (/invalid login credentials/i.test(message)) return '邮箱或密码不正确，请重新输入。'
  if (/email not confirmed/i.test(message)) return '请先打开验证邮件完成邮箱确认。'
  if (/too many requests|rate limit/i.test(message)) return '尝试次数较多，请稍后再试。'
  if (/failed to fetch|network|offline/i.test(message)) return '暂时无法连接账号服务，请检查网络后重试。'

  return '账号服务暂时不可用，请稍后再试。'
}
