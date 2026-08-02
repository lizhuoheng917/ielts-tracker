import { describe, expect, it } from 'vitest'

import {
  BrowserTrackerShadowSyncPersistence,
  createTrackerShadowSyncAccountState,
} from '@/sync/trackerShadowSyncPersistence'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, String(value)) }
}

describe('Tracker shadow sync account persistence', () => {
  it('keeps independent durable mirrors for different accounts', async () => {
    const persistence = new BrowserTrackerShadowSyncPersistence(new MemoryStorage())
    const first = createTrackerShadowSyncAccountState({
      accountUserId: 'account-a',
      deviceId: 'device-a',
      localDataEpoch: 'epoch-a',
      now: '2026-08-03T00:00:00.000Z',
    })
    const second = createTrackerShadowSyncAccountState({
      accountUserId: 'account-b',
      deviceId: 'device-b',
      localDataEpoch: 'epoch-b',
      now: '2026-08-03T00:00:00.000Z',
    })
    first.cursor = 3
    second.cursor = 9

    await persistence.save(first)
    await persistence.save(second)

    expect(await persistence.load('account-a')).toMatchObject({ deviceId: 'device-a', cursor: 3 })
    expect(await persistence.load('account-b')).toMatchObject({ deviceId: 'device-b', cursor: 9 })
  })

  it('returns clones so callers cannot mutate the durable mirror by reference', async () => {
    const persistence = new BrowserTrackerShadowSyncPersistence(new MemoryStorage())
    const state = createTrackerShadowSyncAccountState({
      accountUserId: 'account-a',
      deviceId: 'device-a',
      localDataEpoch: 'epoch-a',
      now: '2026-08-03T00:00:00.000Z',
    })
    await persistence.save(state)
    const loaded = await persistence.load('account-a')
    if (!loaded) throw new Error('missing persisted state')
    loaded.cursor = 99

    expect((await persistence.load('account-a'))?.cursor).toBe(0)
  })
})
