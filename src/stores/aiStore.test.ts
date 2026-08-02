import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

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
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const memoryStorage = new MemoryStorage()
let migrateAIStoreState: typeof import('./aiStore').migrateAIStoreState
let useAIStore: typeof import('./aiStore').useAIStore

beforeAll(async () => {
  vi.stubGlobal('localStorage', memoryStorage)
  ;({ migrateAIStoreState, useAIStore } = await import('./aiStore'))
})

describe('AI custom-provider state', () => {
  beforeEach(() => {
    memoryStorage.clear()
    useAIStore.getState().clearConfig()
  })

  it('keeps the legacy Agnes connection on the reviewed 2.0 preset', () => {
    expect(migrateAIStoreState({
      routeMode: 'custom',
      apiKey: 'legacy-key',
      baseURL: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-2.0-flash',
    }, 1)).toMatchObject({
      routeMode: 'custom',
      providerPreset: 'agnes',
      baseURL: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-2.0-flash',
    })
  })

  it('repairs the mistaken 2.5 preset when persisted version 2 is upgraded', () => {
    expect(migrateAIStoreState({
      routeMode: 'custom',
      providerPreset: 'agnes',
      apiKey: 'kept-on-device',
      baseURL: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-2.5-flash',
    }, 2)).toMatchObject({
      routeMode: 'custom',
      providerPreset: 'agnes',
      apiKey: 'kept-on-device',
      baseURL: 'https://apihub.agnes-ai.com/v1',
      model: 'agnes-2.0-flash',
    })
  })

  it('preserves an arbitrary OpenAI-compatible connection during migration', () => {
    expect(migrateAIStoreState({
      routeMode: 'custom',
      apiKey: 'legacy-key',
      baseURL: 'https://gateway.example.test/openai/v1',
      model: 'organization/model',
    }, 1)).toMatchObject({
      routeMode: 'custom',
      providerPreset: 'openai-compatible',
      baseURL: 'https://gateway.example.test/openai/v1',
      model: 'organization/model',
    })
  })

  it('clears the previous provider key when a user explicitly changes presets', () => {
    useAIStore.setState({ routeMode: 'custom', apiKey: 'agnes-secret' })

    useAIStore.getState().setProviderPreset('deepseek')

    expect(useAIStore.getState()).toMatchObject({
      routeMode: 'custom',
      providerPreset: 'deepseek',
      apiKey: '',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    })
  })

  it('requires users to fill the generic endpoint and model without changing Managed routing', () => {
    useAIStore.setState({ routeMode: 'managed', apiKey: 'must-be-cleared' })

    useAIStore.getState().setProviderPreset('openai-compatible')

    expect(useAIStore.getState()).toMatchObject({
      routeMode: 'managed',
      providerPreset: 'openai-compatible',
      apiKey: '',
      baseURL: '',
      model: '',
    })
  })
})
