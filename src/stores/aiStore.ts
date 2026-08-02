import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { STORAGE_PREFIX } from '@/lib/constants'
import {
  DEFAULT_CUSTOM_AI_PROVIDER_PRESET_ID,
  getCustomAiProviderPreset,
  inferCustomAiProviderPreset,
  isCustomAiProviderPresetId,
  type CustomAiProviderPresetId,
} from '@/ai/customProviderPresets'

export type AiRouteMode = 'managed' | 'custom'

interface AIStore {
  routeMode: AiRouteMode
  providerPreset: CustomAiProviderPresetId
  apiKey: string
  baseURL: string
  model: string
  setProviderPreset: (preset: CustomAiProviderPresetId) => void
  setApiKey: (key: string) => void
  setBaseURL: (url: string) => void
  setModel: (model: string) => void
  setRouteMode: (mode: AiRouteMode) => void
  clearConfig: () => void
}

const DEFAULT_CUSTOM_AI_PROVIDER = getCustomAiProviderPreset(DEFAULT_CUSTOM_AI_PROVIDER_PRESET_ID)

export function migrateAIStoreState(persistedState: unknown, persistedVersion: number): object {
  const state = typeof persistedState === 'object' && persistedState !== null
    ? persistedState as Record<string, unknown>
    : {}
  const apiKey = typeof state.apiKey === 'string' ? state.apiKey : ''
  const persistedMode = state.routeMode === 'managed' || state.routeMode === 'custom'
    ? state.routeMode
    : undefined
  const providerPreset = persistedVersion >= 2 && isCustomAiProviderPresetId(state.providerPreset)
    ? state.providerPreset
    : inferCustomAiProviderPreset(state.baseURL, state.model)
  const preset = getCustomAiProviderPreset(providerPreset)
  const baseURL = preset.editableConnection && typeof state.baseURL === 'string'
    ? state.baseURL
    : preset.baseURL
  const model = preset.editableConnection && typeof state.model === 'string'
    ? state.model
    : preset.model

  return {
    ...state,
    providerPreset,
    baseURL,
    model,
    routeMode: persistedVersion >= 1 && persistedMode
      ? persistedMode
      : apiKey.trim().length > 0
        ? 'custom'
        : 'managed',
  }
}

export const useAIStore = create<AIStore>()(
  persist(
    (set) => ({
      routeMode: 'managed',
      providerPreset: DEFAULT_CUSTOM_AI_PROVIDER_PRESET_ID,
      apiKey: '',
      baseURL: DEFAULT_CUSTOM_AI_PROVIDER.baseURL,
      model: DEFAULT_CUSTOM_AI_PROVIDER.model,
      setProviderPreset: (providerPreset) => {
        const preset = getCustomAiProviderPreset(providerPreset)
        set({
          providerPreset,
          apiKey: '',
          baseURL: preset.baseURL,
          model: preset.model,
        })
      },
      setApiKey: (key) => set({ apiKey: key }),
      setBaseURL: (url) => set({ baseURL: url }),
      setModel: (model) => set({ model }),
      setRouteMode: (routeMode) => set({ routeMode }),
      clearConfig: () => set({
        routeMode: 'managed',
        providerPreset: DEFAULT_CUSTOM_AI_PROVIDER_PRESET_ID,
        apiKey: '',
        baseURL: DEFAULT_CUSTOM_AI_PROVIDER.baseURL,
        model: DEFAULT_CUSTOM_AI_PROVIDER.model,
      }),
    }),
    {
      name: `${STORAGE_PREFIX}ai-config`,
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: migrateAIStoreState,
    }
  )
)
