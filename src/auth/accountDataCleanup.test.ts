import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_STORAGE_KEY } from '@/auth/config'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('clearTrackerDataAfterAccountDeletion', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('localStorage', new MemoryStorage())
    vi.stubGlobal('sessionStorage', new MemoryStorage())
  })

  it('clears Tracker and its own auth state without touching another app origin key', async () => {
    localStorage.setItem('ielts-tracker:wordRecords', 'local-word-data')
    localStorage.setItem('ielts-tracker:mutationJournal', 'pending')
    localStorage.setItem(`${AUTH_STORAGE_KEY}:production:olkvqmnuyxuddgpcordp`, 'auth-data')
    localStorage.setItem('lexi-tracker-guest-mode-v1', 'true')
    localStorage.setItem('another-app:data', 'must-survive')
    sessionStorage.setItem('ielts-tracker:canonicalMutationOwner', 'owner')
    sessionStorage.setItem('another-app:session', 'must-survive')

    const { clearTrackerDataAfterAccountDeletion } = await import('@/auth/accountDataCleanup')
    await clearTrackerDataAfterAccountDeletion('20000000-0000-4000-8000-000000000001')

    expect(localStorage.getItem('ielts-tracker:wordRecords')).toBeNull()
    expect(localStorage.getItem('ielts-tracker:mutationJournal')).toBeNull()
    expect(localStorage.getItem(`${AUTH_STORAGE_KEY}:production:olkvqmnuyxuddgpcordp`)).toBeNull()
    expect(localStorage.getItem('lexi-tracker-guest-mode-v1')).toBeNull()
    expect(localStorage.getItem('another-app:data')).toBe('must-survive')
    expect(sessionStorage.getItem('ielts-tracker:canonicalMutationOwner')).toBeNull()
    expect(sessionStorage.getItem('another-app:session')).toBe('must-survive')
  })
})
