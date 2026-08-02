import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/auth/config'
import { MANAGED_AI_DATA_BINDING_KEY_PREFIX } from '@/auth/managedAiDataBinding'

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

describe('shared Lexi identity data boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new MemoryStorage())
  })

  it('keeps the account session when the learner explicitly clears Tracker data', async () => {
    const authSession = '{"access_token":"auth-only-marker"}'
    localStorage.setItem(AUTH_STORAGE_KEY, authSession)
    localStorage.setItem('ielts-tracker:wordRecords', '{"state":{"records":[]}}')
    localStorage.setItem('ielts-tracker:diaryEntries', '{"state":{"entries":[]}}')
    localStorage.setItem(
      `${MANAGED_AI_DATA_BINDING_KEY_PREFIX}staging:kkynryhceurvnylprxyx`,
      'managed-ai-binding-must-be-cleared',
    )

    const { useSettingsStore } = await import('@/stores/settingsStore')
    useSettingsStore.getState().clearAllData()

    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe(authSession)
    expect(localStorage.getItem('ielts-tracker:wordRecords')).toBeNull()
    expect(localStorage.getItem('ielts-tracker:diaryEntries')).toBeNull()
    expect(localStorage.getItem(
      `${MANAGED_AI_DATA_BINDING_KEY_PREFIX}staging:kkynryhceurvnylprxyx`,
    )).toBeNull()
  })

  it('does not include the account session in portable Tracker backups', async () => {
    const authMarker = 'auth-session-must-not-be-exported'
    const bindingMarker = 'managed-ai-binding-must-not-be-exported'
    localStorage.setItem(AUTH_STORAGE_KEY, authMarker)
    localStorage.setItem(
      `${MANAGED_AI_DATA_BINDING_KEY_PREFIX}staging:kkynryhceurvnylprxyx`,
      bindingMarker,
    )

    const [{ serializeBackupV3 }, { browserBackupAdapter }] = await Promise.all([
      import('@/data/backupService'),
      import('@/data/browserBackupAdapter'),
    ])
    const backup = serializeBackupV3(browserBackupAdapter)

    expect(backup).not.toContain(AUTH_STORAGE_KEY)
    expect(backup).not.toContain(authMarker)
    expect(backup).not.toContain(MANAGED_AI_DATA_BINDING_KEY_PREFIX)
    expect(backup).not.toContain(bindingMarker)
  })

  it('invalidates every Managed AI binding only after a portable backup imports successfully', async () => {
    const bindingKey = `${MANAGED_AI_DATA_BINDING_KEY_PREFIX}staging:kkynryhceurvnylprxyx`
    const [{ importBackupJson, serializeBackupV3 }, { browserBackupAdapter }] = await Promise.all([
      import('@/data/backupService'),
      import('@/data/browserBackupAdapter'),
    ])
    const backup = serializeBackupV3(browserBackupAdapter)
    localStorage.setItem(bindingKey, 'old-dataset-binding')

    importBackupJson(backup, browserBackupAdapter)

    expect(localStorage.getItem(bindingKey)).toBeNull()

    localStorage.setItem(bindingKey, 'binding-must-survive-rejected-import')
    expect(() => importBackupJson('{"format":"wrong"}', browserBackupAdapter)).toThrow()
    expect(localStorage.getItem(bindingKey)).toBe('binding-must-survive-rejected-import')
  })
})
