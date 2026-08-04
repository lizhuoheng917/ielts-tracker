import { describe, expect, it, vi } from 'vitest'

import {
  ACCOUNT_DELETION_CONFIRMATION,
  deleteCurrentLexiAccount,
  type AccountDeletionClient,
} from '@/auth/accountDeletion'

function fakeClient(result: {
  data?: unknown
  error?: { message?: string; code?: string } | null
}): AccountDeletionClient {
  return {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: result.data, error: result.error ?? null }),
    },
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }
}

describe('deleteCurrentLexiAccount', () => {
  it('uses the fixed confirmation phrase and only succeeds on a server acknowledgement', async () => {
    const client = fakeClient({ data: { ok: true } })

    await expect(deleteCurrentLexiAccount(client)).resolves.toBeUndefined()

    expect(client.functions.invoke).toHaveBeenCalledWith('lexi-account-delete', {
      body: { confirmation: ACCOUNT_DELETION_CONFIRMATION },
    })
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('fails closed when the server does not confirm deletion', async () => {
    const client = fakeClient({ data: { ok: false } })

    await expect(deleteCurrentLexiAccount(client)).rejects.toThrow('未获服务端确认')
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })

  it('keeps provider internals out of an unknown failure message', async () => {
    const client = fakeClient({ error: { message: 'upstream trace api-key=secret' } })

    await expect(deleteCurrentLexiAccount(client)).rejects.toThrow('账号暂时无法注销')
    expect(client.auth.signOut).not.toHaveBeenCalled()
  })
})
