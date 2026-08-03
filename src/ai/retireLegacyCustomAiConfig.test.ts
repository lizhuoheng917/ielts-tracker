import { describe, expect, it } from 'vitest'

import { LEGACY_CUSTOM_AI_CONFIG_KEY, retireLegacyCustomAiConfig } from './retireLegacyCustomAiConfig'

function createStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed))
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('retireLegacyCustomAiConfig', () => {
  it('removes the retired browser-side AI connection without touching other data', () => {
    const storage = createStorage({
      [LEGACY_CUSTOM_AI_CONFIG_KEY]: JSON.stringify({ apiKey: 'legacy-secret' }),
      'ielts-tracker:wordRecords': '[]',
    })

    expect(retireLegacyCustomAiConfig(storage)).toBe(true)
    expect(storage.getItem(LEGACY_CUSTOM_AI_CONFIG_KEY)).toBeNull()
    expect(storage.getItem('ielts-tracker:wordRecords')).toBe('[]')
  })

  it('does not interrupt startup when local storage cannot be written', () => {
    const storage = createStorage()
    storage.removeItem = () => { throw new DOMException('blocked', 'SecurityError') }

    expect(retireLegacyCustomAiConfig(storage)).toBe(false)
  })
})
