import { describe, expect, it, vi } from 'vitest'

import {
  advanceCanonicalMutationEpoch,
  CANONICAL_MUTATION_EPOCH_KEY,
  CANONICAL_MUTATION_LEASE_KEY,
  CanonicalMutationBusyError,
  readCanonicalMutationEpoch,
  withCanonicalMutationLock,
} from './canonicalMutationCoordinator'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('canonical mutation coordinator', () => {
  it('serializes concurrent callbacks before either canonical write can overlap', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => undefined
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
    const lockManager = {
      request: async <T>(
        _name: string,
        _options: { mode: 'exclusive' },
        callback: () => T | PromiseLike<T>,
      ) => callback(),
    }

    const first = withCanonicalMutationLock(async () => {
      order.push('first:start')
      await firstGate
      order.push('first:end')
      return 'first'
    }, { lockManager })
    const second = withCanonicalMutationLock(async () => {
      order.push('second:start')
      order.push('second:end')
      return 'second'
    }, { lockManager })

    await vi.waitFor(() => expect(order).toEqual(['first:start']))
    releaseFirst()

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('fails closed while another owner holds an unexpired compatibility lease', async () => {
    const storage = new MemoryStorage()
    storage.setItem(CANONICAL_MUTATION_LEASE_KEY, JSON.stringify({
      ownerId: 'another-tab',
      token: 'foreign-lease',
      expiresAt: Date.now() + 60_000,
    }))

    await expect(withCanonicalMutationLock(
      () => 'must-not-run',
      { lockManager: null, storage, acquireTimeoutMs: 0 },
    )).rejects.toBeInstanceOf(CanonicalMutationBusyError)
  })

  it('reclaims an expired compatibility lease and releases it after success', async () => {
    const storage = new MemoryStorage()
    storage.setItem(CANONICAL_MUTATION_LEASE_KEY, JSON.stringify({
      ownerId: 'another-tab',
      token: 'expired-lease',
      expiresAt: Date.now() - 1,
    }))

    await expect(withCanonicalMutationLock(
      () => 'saved',
      { lockManager: null, storage, acquireTimeoutMs: 100, leaseTtlMs: 500 },
    )).resolves.toBe('saved')
    expect(storage.getItem(CANONICAL_MUTATION_LEASE_KEY)).toBeNull()
  })

  it('fails closed when neither Web Locks nor safe storage is available', async () => {
    await expect(withCanonicalMutationLock(
      () => 'must-not-run',
      { lockManager: null, storage: null },
    )).rejects.toBeInstanceOf(CanonicalMutationBusyError)
  })

  it('advances a persistent epoch for import and clear tombstones', () => {
    const storage = new MemoryStorage()

    expect(readCanonicalMutationEpoch(storage)).toBe('initial')
    const epoch = advanceCanonicalMutationEpoch(storage)

    expect(epoch).not.toBe('initial')
    expect(readCanonicalMutationEpoch(storage)).toBe(epoch)
    expect(storage.getItem(CANONICAL_MUTATION_EPOCH_KEY)).toBe(epoch)
  })
})
