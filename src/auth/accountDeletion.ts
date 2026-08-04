import { requireSupabase } from '@/lib/supabase'

export const ACCOUNT_DELETION_CONFIRMATION = 'DELETE_MY_LEXI_ACCOUNT'

type FunctionResult = {
  data?: unknown
  error: { message?: string; code?: string } | null
}

export type AccountDeletionClient = {
  functions: {
    invoke: (name: string, options: { body: { confirmation: string } }) => Promise<FunctionResult>
  }
  auth: {
    signOut: (options: { scope: 'local' }) => Promise<{ error: { message?: string } | null }>
  }
}

function responseConfirmed(data: unknown): boolean {
  return typeof data === 'object'
    && data !== null
    && (data as { ok?: unknown }).ok === true
}

function safeDeletionError(error: FunctionResult['error']): Error {
  const evidence = `${error?.code ?? ''} ${error?.message ?? ''}`
  if (/401|403|jwt|not authenticated|unauthorized/i.test(evidence)) {
    return new Error('登录状态已失效，请重新登录后再注销账号。')
  }
  if (/confirmation/i.test(evidence)) {
    return new Error('确认信息未通过，请重新打开确认窗口后再试。')
  }
  if (/network|fetch|timeout|offline/i.test(evidence)) {
    return new Error('暂时无法连接账号服务，请检查网络后重试。')
  }
  return new Error('账号暂时无法注销，请稍后再试。')
}

/**
 * The browser never receives a service-role credential. The Edge Function
 * derives the user solely from the current bearer token and deletes that one
 * shared Lexi identity (including server-side cascades) after confirmation.
 */
export async function deleteCurrentLexiAccount(
  client: AccountDeletionClient = requireSupabase() as unknown as AccountDeletionClient,
): Promise<void> {
  const { data, error } = await client.functions.invoke('lexi-account-delete', {
    body: { confirmation: ACCOUNT_DELETION_CONFIRMATION },
  })
  if (error) throw safeDeletionError(error)
  if (!responseConfirmed(data)) {
    throw new Error('账号注销未获服务端确认，请稍后重试。')
  }

  // The server has already revoked the shared identity. Clear this browser's
  // session best-effort so React immediately stops all authenticated work.
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch {
    // A deleted Auth user can make local sign-out return an expected error.
  }
}
