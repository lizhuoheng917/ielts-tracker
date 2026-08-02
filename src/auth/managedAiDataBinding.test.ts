import { describe, expect, it, vi } from 'vitest'

import type { AuthConfiguration } from '@/auth/config'
import {
  MANAGED_AI_DATA_BINDING_KEY_PREFIX,
  clearAllManagedAiDataBindings,
  confirmManagedAiDataBinding,
  confirmManagedAiDataBindingForCurrentAccount,
  getManagedAiDataBindingStorageKey,
  inspectManagedAiDataBinding,
} from '@/auth/managedAiDataBinding'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value))
  }
}

const ACCOUNT_A = '123e4567-e89b-42d3-a456-426614174001'
const ACCOUNT_B = '123e4567-e89b-42d3-a456-426614174002'
const NOW = new Date('2026-08-01T12:00:00.000Z')

function readyConfiguration(
  environment: 'staging' | 'production' = 'staging',
  projectRef = environment === 'staging'
    ? 'kkynryhceurvnylprxyx'
    : 'olkvqmnuyxuddgpcordp',
): AuthConfiguration {
  return {
    status: 'ready',
    environment,
    projectRef,
    url: `https://${projectRef}.supabase.co`,
    publishableKey: 'browser-safe-test-key',
  }
}

describe('Managed AI local data account binding', () => {
  it('stays unbound until explicit confirmation and never lets another account overwrite it', () => {
    const storage = new MemoryStorage()
    const configuration = readyConfiguration()
    const dependencies = { configuration, storage, now: () => NOW }

    expect(inspectManagedAiDataBinding(ACCOUNT_A, dependencies)).toEqual({ status: 'unbound' })
    expect(storage.length).toBe(0)

    expect(confirmManagedAiDataBinding(ACCOUNT_A, dependencies)).toEqual({
      status: 'bound',
      confirmedAt: NOW.toISOString(),
    })
    expect(inspectManagedAiDataBinding(ACCOUNT_A, dependencies).status).toBe('bound')
    expect(inspectManagedAiDataBinding(ACCOUNT_B, dependencies).status).toBe('mismatch')
    expect(confirmManagedAiDataBinding(ACCOUNT_B, dependencies).status).toBe('mismatch')
    expect(inspectManagedAiDataBinding(ACCOUNT_A, dependencies).status).toBe('bound')
  })

  it('isolates confirmations by Supabase environment and project', () => {
    const storage = new MemoryStorage()
    const staging = readyConfiguration('staging')
    const production = readyConfiguration('production')

    confirmManagedAiDataBinding(ACCOUNT_A, { configuration: staging, storage, now: () => NOW })

    expect(inspectManagedAiDataBinding(ACCOUNT_A, { configuration: staging, storage }).status).toBe('bound')
    expect(inspectManagedAiDataBinding(ACCOUNT_A, { configuration: production, storage }).status).toBe('unbound')
    expect(getManagedAiDataBindingStorageKey(staging)).not.toBe(getManagedAiDataBindingStorageKey(production))
  })

  it('fails closed for corrupt markers and unavailable identity/configuration', () => {
    const storage = new MemoryStorage()
    const configuration = readyConfiguration()
    const key = getManagedAiDataBindingStorageKey(configuration)
    if (!key) throw new Error('expected a binding key')
    storage.setItem(key, '{not-json')

    expect(inspectManagedAiDataBinding(ACCOUNT_A, { configuration, storage })).toEqual({ status: 'invalid' })
    expect(inspectManagedAiDataBinding('not-a-user-id', { configuration, storage })).toEqual({ status: 'unavailable' })
    expect(inspectManagedAiDataBinding(ACCOUNT_A, {
      configuration: { status: 'unconfigured' },
      storage,
    })).toEqual({ status: 'unavailable' })
  })

  it('clears every environment binding while preserving unrelated local data', () => {
    const storage = new MemoryStorage()
    storage.setItem(`${MANAGED_AI_DATA_BINDING_KEY_PREFIX}staging:one`, 'binding-one')
    storage.setItem(`${MANAGED_AI_DATA_BINDING_KEY_PREFIX}production:two`, 'binding-two')
    storage.setItem('ielts-tracker:wordRecords', 'keep-records')

    expect(clearAllManagedAiDataBindings(storage)).toBe(2)
    expect(storage.getItem(`${MANAGED_AI_DATA_BINDING_KEY_PREFIX}staging:one`)).toBeNull()
    expect(storage.getItem(`${MANAGED_AI_DATA_BINDING_KEY_PREFIX}production:two`)).toBeNull()
    expect(storage.getItem('ielts-tracker:wordRecords')).toBe('keep-records')
  })

  it('does not let an old account-A confirmation update state after an A-to-B auth event', async () => {
    let currentAccountUserId: string | null = ACCOUNT_A
    let resolveVerification: ((accountUserId: string | null) => void) | undefined
    const verification = new Promise<string | null>((resolve) => {
      resolveVerification = resolve
    })
    const inspectBinding = vi.fn((accountUserId: string) => accountUserId === ACCOUNT_B
      ? { status: 'mismatch' as const, confirmedAt: NOW.toISOString() }
      : { status: 'unbound' as const })
    const confirmBinding = vi.fn(() => ({
      status: 'bound' as const,
      confirmedAt: NOW.toISOString(),
    }))

    const pending = confirmManagedAiDataBindingForCurrentAccount({
      getCurrentAccountUserId: () => currentAccountUserId,
      verifyCurrentAccountUserId: () => verification,
      inspectBinding,
      confirmBinding,
    })

    currentAccountUserId = ACCOUNT_B
    resolveVerification?.(ACCOUNT_A)

    await expect(pending).resolves.toEqual({
      ok: false,
      reason: 'account-changed',
      binding: { status: 'mismatch', confirmedAt: NOW.toISOString() },
    })
    expect(inspectBinding).toHaveBeenCalledWith(ACCOUNT_B)
    expect(confirmBinding).not.toHaveBeenCalled()
  })
})
